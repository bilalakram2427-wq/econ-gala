# Database

Owner: Bilal. Nobody else edits this folder.

Everything the game actually enforces lives here. The client decides nothing:
it sends a request and renders the answer.

## Running it on Supabase

Dashboard → SQL Editor, paste and run each file in order:

```
migrations/001_schema.sql
migrations/002_rls.sql
migrations/003_game_functions.sql
migrations/004_staff_admin_functions.sql
migrations/005_cron.sql          ← enable pg_cron first (Database → Extensions)
seed/001_config.sql
seed/002_starters.sql
```

Then, before anything else:

```sql
-- A real secret. The seed file ships a placeholder on purpose.
update config set value = gen_random_uuid()::text || gen_random_uuid()::text
 where key = 'secret.qr_master';

-- Yourself as admin. The uuid comes from Authentication → Users.
insert into staff_users (auth_user_id, name, role)
values ('<your auth uuid>', 'Bilal', 'admin');
```

Volunteers get `'staff'` instead of `'admin'`: they can check guests in and
read out credentials, and nothing else.

## Importing the guest list

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...        # Settings → API, service_role

node db/import-guests.mjs guests.csv --dry-run   # look first
node db/import-guests.mjs guests.csv             # then do it
```

The service role key bypasses RLS. It never goes in the repo, in `.env.local`,
or anywhere the browser can see.

Two things the import does that are worth knowing:

**Reg numbers come from the email column, not the roll-number column.** People
type whatever they like into the roll-number field — the sample sheet had
`027-A` next to a perfectly good `fa26-bed-027@cuilahore.edu.pk`. The email is
machine-readable, so that is what we trust. Anything that does not look like a
university address is rejected and listed rather than guessed at.

**Display names are derived**: "Ahmad Moaz" becomes "Ahmad M.", which is what
the big screen shows and what the consent text promises. Check the list after
importing and fix any that read oddly, because that is the name 250 people see.

Never commit the guest list. It has phone numbers and emails, and the repo is
public. `*.csv` is in `.gitignore` for that reason.

## Testing

The migrations run on a plain Postgres 16, which is how the rule suite is
tested without touching Supabase:

```bash
initdb -D /tmp/pgdata -A trust
pg_ctl -D /tmp/pgdata -o '-p 5433' start
createdb -p 5433 gala

psql -p 5433 -d gala -v ON_ERROR_STOP=1 -f test/000_local_shim.sql
psql -p 5433 -d gala -v ON_ERROR_STOP=1 -f migrations/001_schema.sql
# ... 002, 003, 004, then both seed files ...
psql -p 5433 -d gala -v ON_ERROR_STOP=1 -f test/001_rules.sql
```

`test/000_local_shim.sql` fakes the few things Supabase provides and a bare
Postgres does not — `auth.uid()`, the `anon` and `authenticated` roles. Never
run it against Supabase.

`test/001_rules.sql` is the acceptance suite from spec section 19. It currently
proves, among other things:

- a guest who is logged in but not checked in cannot do anything (D3)
- `me()` still answers for that guest, so the app can show the gate screen
- mutual great scores 2, one-sided scores 1
- a pair can connect once, ever
- one pending or active connection at a time
- the cooldown and the minimum chat time both hold
- text under 15 or over 140 characters is refused, as is the partner's name
- a one-sided submission scores nothing and leaves the connection open
- the same idempotency key twice does not score twice
- organizers never appear on the public leaderboard
- scanning is refused while paused and outside GAME/COMEBACK
- QR tokens verify for the current and previous window only, and a forged
  signature is refused
- every point shown to a guest comes from the ledger

Concurrency is tested separately by running mutual scans from parallel
sessions: ten pairs scanning each other at the same instant produced ten
connections, no duplicates and no deadlocks.

## Shape of it

**The gate (D3).** `require_playable_guest()` is the first line of every game
function. A valid login is not permission to play — until a volunteer sets
`checked_in_at`, every action returns `NOT_CHECKED_IN`. `me()` is the one
exception: it answers regardless, so the app can show "see you at the gate"
instead of an error.

**Locking order, always:** the two guest rows ordered by id, then the
connection row. `scan()` and `submit()` both do it this way, which is what
stops them deadlocking when two people scan each other simultaneously.

**The ledger is the score.** Nothing stores a total. A void is a compensating
negative row, never a delete, so the history survives.

**Config over constants.** Every number the game checks is a row in `config`,
so a pacing value can be changed on the night without a deploy.

## After the event

Within 7 days (spec section 18):

```sql
drop table guest_credentials;
update guests set phone = null, email = null, device_id = null;
update connections set lo_text = null, hi_text = null;
```

Export the anonymised aggregates for the society first.
