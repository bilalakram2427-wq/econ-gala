-- Econ Gala networking game — schema
-- Spec v1.0 section 10, as amended by docs/DECISIONS.md.
--
-- Run order: 001_schema, 002_rls, 003_game_functions, 004_staff_admin_functions,
--            005_cron, then seed/001_config.sql and seed/002_starters.sql.
--
-- Changes from the spec worth knowing:
--   - No claim_tokens table. Login is reg number + password (D2).
--   - No missions, spins or wheel_segments. Those happen physically (D4).
--   - `icebreakers` is renamed `starters` and created BEFORE connections, which
--     references it. The spec listed it afterwards, so running the spec's DDL
--     in order would fail.
--   - connections.starter_ids holds three prompts, not one (D6).

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type game_state as enum (
  'SETUP', 'CHECKIN', 'GAME', 'COMEBACK', 'LOCKED', 'VERIFIED', 'REVEALED'
);

create type conn_status as enum (
  'pending', 'active', 'completed', 'expired', 'voided'
);

create type vote as enum ('great', 'skip');

-- --------------------------------------------------------------- config

-- Single-row-per-key settings. Read by every function; never hardcode a value
-- in a function body (spec section 20, rules for agents).
create table config (
  key    text primary key,
  value  text not null,
  note   text
);

-- ------------------------------------------------------------- starters

-- Conversation prompts. The server picks three per connection.
create table starters (
  id      int generated always as identity primary key,
  text    text not null,
  active  boolean not null default true
);

create index starters_active_idx on starters (id) where active;

-- --------------------------------------------------------------- guests

create table guests (
  id uuid primary key default gen_random_uuid(),

  -- Links this row to its Supabase Auth user. Null until the import creates
  -- the account; the auth user's email is <reg_no lowercased>@econgala.local.
  auth_user_id uuid unique,

  -- Derived from the registration email, NOT from the roll-number column of
  -- the sheet: people type whatever they like into that field (we have seen
  -- "027-A"), whereas fa26-bed-027@cuilahore.edu.pk is machine-readable.
  -- Stored uppercase. No format is enforced: intakes and departments vary.
  reg_no text unique not null,

  full_name    text not null,  -- what staff check against an ID at the gate
  display_name text not null,  -- what the big screen shows: "Ahmad M."

  email text,
  phone text,

  -- 'Verified', 'Proof submitted', etc., straight from the sheet. Only
  -- 'Verified' guests can be checked in without a staff override (see checkin).
  payment_status text,

  is_organizer        boolean not null default false,
  show_on_leaderboard boolean not null default true,
  disqualified        boolean not null default false,

  -- THE GATE (D3). Logging in is not permission to play. Until a volunteer
  -- sets this, every game function refuses with NOT_CHECKED_IN.
  checked_in_at timestamptz,
  checked_in_by uuid,
  opted_in_at   timestamptz,

  -- Bumped on each new login elsewhere; invalidates older sessions.
  session_version int not null default 0,

  -- Random UUID from the phone's local storage. Duplicate values across
  -- guests raise a DEVICE_SHARED flag.
  device_id text,

  -- Denormalised for the pacing check, so scan() does not have to aggregate.
  last_conn_started_at timestamptz,
  active_connection_id uuid,

  created_at timestamptz not null default now()
);

create index guests_reg_no_idx       on guests (reg_no);
create index guests_full_name_idx    on guests using gin (to_tsvector('simple', full_name));
create index guests_checked_in_idx   on guests (checked_in_at) where checked_in_at is not null;
create index guests_device_id_idx    on guests (device_id) where device_id is not null;

-- -------------------------------------------------- guest credentials

-- The readable copy of each guest's password, so a volunteer at the gate can
-- read it out loud. Supabase Auth holds the real (hashed) one; this is a side
-- table that only staff functions ever touch.
--
-- Storing a password in readable form is normally indefensible. The reasoning
-- here: these are random six-character strings, generated at import, valid for
-- one evening, protecting nothing but a game score, and the whole check-in
-- flow depends on a volunteer being able to say one out loud. There is no
-- version of this that works at a gate with a queue and also hides the
-- password from staff.
--
-- Mitigations: no client can read this table (no RLS policy at all, so even
-- staff reach it only through checkin() and reveal_credentials(), one guest at
-- a time); every reveal is written to the audit log; and the whole table is
-- dropped within 7 days of the event along with the rest of the personal data
-- (spec section 18).
create table guest_credentials (
  guest_id uuid primary key references guests(id) on delete cascade,
  password text not null
);

-- ---------------------------------------------------------- connections

create table connections (
  id uuid primary key default gen_random_uuid(),

  -- Always stored with the lower uuid first, so a pair has one canonical row
  -- and the unique index below can do its job.
  guest_lo  uuid not null references guests(id),
  guest_hi  uuid not null references guests(id),
  initiator uuid not null references guests(id),

  status conn_status not null default 'pending',

  -- The phase the connection STARTED in. A connection keeps its phase's rules
  -- even if the game moves to COMEBACK mid-conversation (spec section 9).
  phase game_state not null,

  -- Three prompts (D6). The pair picks whichever they like.
  starter_ids int[] not null default '{}',

  attempt int not null default 1,

  scanned_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,

  lo_text text, hi_text text,
  lo_vote vote,  hi_vote vote,
  lo_submitted_at timestamptz, hi_submitted_at timestamptz,

  -- Idempotency keys, so a retried submit cannot score twice.
  lo_idempotency_key uuid, hi_idempotency_key uuid,

  under_review boolean not null default false,
  void_reason  text,

  constraint pair_ordered check (guest_lo < guest_hi),
  constraint not_self     check (guest_lo <> guest_hi)
);

-- R3: a pair can have at most one live or completed connection, ever.
-- Expired and voided rows are excluded so a failed attempt can be retried.
create unique index uniq_pair_live_or_done
  on connections (guest_lo, guest_hi)
  where status in ('pending', 'active', 'completed');

create index connections_status_idx     on connections (status);
create index connections_lo_idx         on connections (guest_lo);
create index connections_hi_idx         on connections (guest_hi);
create index connections_pending_age_idx on connections (scanned_at) where status = 'pending';
create index connections_active_age_idx  on connections (started_at)  where status = 'active';
create index connections_completed_idx   on connections (completed_at) where status = 'completed';

alter table guests
  add constraint guests_active_connection_fk
  foreign key (active_connection_id) references connections(id) on delete set null;

-- -------------------------------------------------------- score ledger

-- Append-only. A guest's score is the sum of their rows; a void is a
-- compensating negative row, never a delete (spec section 10).
create table score_ledger (
  id            bigint generated always as identity primary key,
  guest_id      uuid not null references guests(id),
  connection_id uuid references connections(id),
  points        int  not null,
  reason        text not null
    check (reason in ('new_connection', 'mutual_great', 'void', 'manual_adjust')),
  created_by    text not null default 'system',
  created_at    timestamptz not null default now()
);

create index ledger_guest_idx      on score_ledger (guest_id);
create index ledger_connection_idx on score_ledger (connection_id);

-- ---------------------------------------------------------------- flags

create table flags (
  id            uuid primary key default gen_random_uuid(),
  guest_id      uuid not null references guests(id),
  connection_id uuid references connections(id),
  code          text not null,
  severity      text not null default 'info' check (severity in ('info','warn','high')),
  details       jsonb not null default '{}',
  status        text not null default 'open' check (status in ('open','cleared','confirmed')),
  created_at    timestamptz not null default now(),
  resolved_by   uuid,
  resolved_at   timestamptz
);

create index flags_open_idx  on flags (created_at desc) where status = 'open';
create index flags_guest_idx on flags (guest_id);

-- ---------------------------------------------------- comeback snapshot

-- Written once, atomically, on the GAME -> COMEBACK transition (D5).
-- Admin eyes only: never returned to a guest, never shown on the display.
create table comeback_snapshot (
  guest_id    uuid primary key references guests(id),
  score       int not null,
  connections int not null,
  rank        int not null,
  taken_at    timestamptz not null default now()
);

-- ------------------------------------------------------------ audit log

create table audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   uuid,
  action  text not null,
  details jsonb not null default '{}'
);

create index audit_at_idx on audit_log (at desc);

-- ------------------------------------------------------------- staff

-- Who may run staff and admin functions. Separate from guests: a volunteer is
-- not a player, and an organizer who plays has a guests row too.
create table staff_users (
  auth_user_id uuid primary key,
  name         text not null,
  role         text not null check (role in ('staff', 'admin')),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------- views

-- One row per guest with their totals. The ledger is the source of truth.
create view guest_scores as
select
  g.id as guest_id,
  g.display_name,
  g.is_organizer,
  g.disqualified,
  g.show_on_leaderboard,
  coalesce(l.score, 0) as score,
  coalesce(c.connections, 0) as connections,
  coalesce(gv.great_votes_received, 0) as great_votes_received,
  coalesce(f.flags_open, 0) as flags_open,
  c.last_completed_at
from guests g
left join lateral (
  select sum(points) as score from score_ledger where guest_id = g.id
) l on true
left join lateral (
  select count(*) as connections, max(completed_at) as last_completed_at
  from connections
  where status = 'completed' and (guest_lo = g.id or guest_hi = g.id)
) c on true
left join lateral (
  select count(*) as great_votes_received
  from connections
  where status = 'completed'
    and ((guest_lo = g.id and hi_vote = 'great')
      or (guest_hi = g.id and lo_vote = 'great'))
) gv on true
left join lateral (
  select count(*) as flags_open from flags where guest_id = g.id and status = 'open'
) f on true;

-- The public leaderboard. Organizers, disqualified guests, guests who opted
-- out of the board, and anyone with an open flag are all excluded
-- (spec section 10 and section 13 policy).
create view top10 as
select
  row_number() over (
    order by s.score desc, s.connections desc, s.last_completed_at asc nulls last
  ) as rank,
  s.display_name,
  s.score
from guest_scores s
join guests g on g.id = s.guest_id
where g.opted_in_at is not null
  and s.show_on_leaderboard
  and not s.is_organizer
  and not s.disqualified
  and s.flags_open = 0
order by rank
limit 10;

commit;
