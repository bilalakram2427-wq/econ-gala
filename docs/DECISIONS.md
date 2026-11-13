# Decisions

Changes the team has made to the specification. **Where this file and
`docs/SPEC.md` disagree, this file wins.** Everything in the spec that is not
listed here still stands.

Last updated: 12 November 2026.

---

## D1 — One web app, not three

The spec suggests separate apps for guest, admin and display. We are building
one Next.js app with route groups. One deploy, one set of environment
variables, one `npm install`. Route groups already code-split, so a guest never
downloads the admin bundle. Separation of *access* is enforced by the database
(RLS and role claims), not by which folder a page sits in.

## D2 — Login is reg number + password

Replaces the one-time claim link in spec section 7.

Every guest on the list gets an account with their registration number and a
**random six-character password**, generated at import.

Reg numbers vary by intake and department — `FA24-BED-001`, `SP26-ECO-071` and
others. **Do not validate the shape anywhere in the app.** Whatever is in the
guest list CSV is correct by definition; the client only trims and uppercases
(`normalizeRegNo` in `lib/config.ts`) and lets the server decide whether the
account exists.
Supabase Auth holds the accounts, with a synthetic email per guest
(`fa24-bed-001@econgala.local`) that is never shown to anyone and never used
for mail.

Dropped as a result: `claim_tokens`, the 10-minute expiry, the staff claim QR,
and the whole "my link expired" failure mode.

Three constraints that make this safe:

- Passwords are random and unrelated to the reg number. Not `bed001`, not a
  shared default.
- The admin and staff screens reveal a password for **one guest at a time, on
  tap**. Never a list of 250.
- Login is rate limited, and a new login ends the previous session.

## D3 — Logging in is not permission to play

**This is the important one.** Reg numbers are sequential and therefore
guessable, so credentials alone cannot be the gate.

A guest can log in from anywhere, at any time. But until a volunteer has
checked them in at the gate against their physical ID, `me().checked_in` is
false, the app shows a "see you at the gate" screen, and **every server action
refuses with `NOT_CHECKED_IN`**.

The volunteer's flow: search the name, check the ID, tap Check in, read out the
reg number and password. The guest types them into their own phone and is in.

## D4 — No missions, no wheel, no dare tracking in the app

Dropped from spec section 14. The comeback mission and the dare wheel happen
**physically**: the host announces it, a real wheel gets spun, staff run it.

Dropped as a result: the `missions`, `spins` and `wheel_segments` tables, the
spin RPC, the mission screen and the dare card.

## D5 — COMEBACK is kept, as a pacing phase

The phase itself stays. At 6:15 the admin flips to COMEBACK, which:

- changes pacing for new connections — cooldown 180s to 120s, minimum chat
  120s to 60s;
- shows the **admin** the bottom 25% with their scores, for the host to
  announce.

Guests see no change beyond the faster pacing. The bottom 25% list is admin
only: it never appears on the display and never reaches a guest. Spec section 4
rule R11 (guests never see a bottom ranking) still holds.

## D6 — Three conversation starters, not one

The server picks three prompts per connection and returns them in
`active_connection.starters`. A pair that does not like the first one can pick
another instead of standing there awkwardly. Still server-chosen: if the client
picked, the two phones would show different prompts.

## D7 — The browser calls Supabase RPCs directly

Not through Next.js API routes. Vercel's free plan meters function invocations
and 250 phones polling for an hour is roughly 200,000 of them. Supabase's
PostgREST layer is not metered that way, and it removes a hop that can fail
outdoors. The endpoint names in spec section 12 survive as the function names
in `lib/api.ts`.

## D8 — Guests poll, only display and admin use realtime

Supabase's free plan allows 200 concurrent realtime connections and we expect
about 250 guests. Guest screens poll every 4 to 5 seconds. This is fine for the
scan handshake: the pending connection lives 90 seconds and the two people are
standing in front of each other.

## D9 — Automatic cheat detection is a stretch goal

The flag *types* stay in the schema and the admin flags queue is built if there
is time. The detection jobs (clique analysis, trigram similarity) are **not**
being built for this event. Verification before awards is manual: two admins
review the top 5 in each category, per spec section 13.

## D10 — Paper stamp cards stay

Unchanged from spec section 17. Twenty-box cards, signed by both people, entered
afterwards as manual connections. This is the fallback for guests without
smartphones and for a network outage, and with this timeline it is our safety
net. Print them on the 18th.

## D11 — Reg numbers come from the roll number column

The registration form asks for the roll number explicitly and labels it "as on
your student card", and students are told to bring that card to the gate. So
the roll number is both the identifier and the thing the volunteer verifies
against.

The email's local part is a fallback for a row whose roll number is missing or
unusable, since not everyone registers with their university address. A row
where neither works is rejected at import and listed for manual fixing rather
than guessed at.

Collisions are detected on the stripped form, so `FA24-BED-010`,
`fa24-bed 010` and `FA24BED010` are recognised as the same student and the
second one is refused rather than creating a duplicate account.

## D12 — Payment is checked by a person, not by the software

`checkin()` does not look at `payment_status` at all. Anyone on the guest list
can be checked in.

The volunteer already sees the payment status on the guest card, and an
unverified guest is sent to whoever handled payment verification. That is the
right place for the decision: a hard block would only produce an unexplained
failure on a volunteer's phone with a queue behind them, and the exception is
rare enough that a human handles it faster than a UI flow would.

The payment status at the moment of check-in is written to the audit log
regardless, so anyone let in unverified is still traceable.

Correcting the payment record is an admin action on the guests panel, with
before and after values logged. Payment is a financial record owned by whoever
handles the money; a volunteer overwriting it mid-queue would destroy the
trail for whoever reconciles afterwards.

## D13 — Admin guests panel

Restores the "Guests" page from spec section 16, which was cut during the
original scoping. It shows the whole roster — including guests who never
turned up, which the leaderboard cannot — with roll number, email, payment
status and arrival state, plus search and filters.

Three admin writes live there: payment status, organizer, and disqualify or
reinstate. Marking organizers has a deadline: they are excluded from prizes
and the comeback pool, so it has to be set before GAME starts.

Lives at `app/(admin)/admin/guests/page.tsx`. That is inside Meerab's route
group but is **Bilal's file** — it was added after her task card was written
and is not part of Task 2.

---

## Still open

1. Does the guest list CSV include a `display_name` column, or do we derive
   first-name-plus-last-initial from the full name? Splitting on the last space
   is wrong often enough that a wrong name on the big screen is a real risk.
   **Asked of Sami.**
2. Prize list per award category.
3. Hosting accounts under a society email, and whether we buy a domain or use
   the free Vercel address.
4. Who is the on-call tech person standing at the venue during the game.
