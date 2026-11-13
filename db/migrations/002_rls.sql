-- Row Level Security.
--
-- The rule from spec section 18: clients get NO insert, update or delete
-- policies on any table, ever. Every mutation goes through a SECURITY DEFINER
-- function in 003 and 004, which run as the table owner and bypass RLS.
--
-- Read access is almost as tight. A guest can read their own guests row and
-- the top10 view. Everything else — other guests, the ledger, flags, the
-- comeback snapshot — is invisible to them, so a tampered client cannot learn
-- anyone else's score or discover that it is in the bottom 25%.
--
-- Acceptance test (spec section 19): a client attempting a direct table write
-- must fail. With no write policy, it does.

begin;

alter table config            enable row level security;
alter table starters          enable row level security;
alter table guests            enable row level security;
alter table guest_credentials enable row level security;
alter table connections       enable row level security;
alter table score_ledger      enable row level security;
alter table flags             enable row level security;
alter table comeback_snapshot enable row level security;
alter table audit_log         enable row level security;
alter table staff_users       enable row level security;

-- Force it for the table owner too, so a mistake in a non-DEFINER function
-- cannot quietly read everything.
alter table guests      force row level security;
alter table connections force row level security;

-- ------------------------------------------------------------- helpers

-- The caller's guests row id, or null if they are not a guest.
create or replace function current_guest_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from guests where auth_user_id = auth.uid();
$$;

create or replace function current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from staff_users where auth_user_id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_staff_role() = 'admin', false);
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_staff_role() in ('staff', 'admin'), false);
$$;

-- ------------------------------------------------------------- guests

-- A guest sees only themselves. Note what this does NOT allow: reading another
-- guest's row to find their score, or listing guests to enumerate the roll.
create policy guests_read_self on guests
  for select
  using (auth_user_id = auth.uid());

create policy guests_read_staff on guests
  for select
  using (is_staff());

-- -------------------------------------------------- guest credentials

-- No policy at all, deliberately. Not even staff may select from this table
-- directly; the only way in is checkin() and reveal_credentials(), which are
-- SECURITY DEFINER, return exactly one guest, and write to the audit log.
-- That is what stops a volunteer's phone from being able to list 250
-- passwords in a single query.

-- -------------------------------------------------------------- config

-- Clients need the pacing values to draw countdowns. These are not secrets —
-- the server enforces them regardless — but the HMAC secret is NOT in this
-- table (it lives in a Vault secret, read only inside get_qr and scan).
create policy config_read_public on config
  for select
  using (key not like 'secret.%');

create policy config_read_admin on config
  for select
  using (is_admin());

-- ------------------------------------------------------------ starters

-- Readable, but it does not matter: the server chooses which three a pair gets
-- and returns the text in the scan payload.
create policy starters_read on starters
  for select
  using (active);

-- --------------------------------------------------------- connections

-- Only your own connections, and only ever through me() anyway. The partner's
-- learned text is never selected by the functions, so it cannot leak here.
create policy connections_read_own on connections
  for select
  using (
    guest_lo = current_guest_id() or guest_hi = current_guest_id()
  );

create policy connections_read_admin on connections
  for select
  using (is_admin());

-- ------------------------------------------------------- score ledger

-- Your own rows only. The guest app shows a total, not a breakdown, but this
-- lets a curious guest audit their own points without seeing anyone else's.
create policy ledger_read_own on score_ledger
  for select
  using (guest_id = current_guest_id());

create policy ledger_read_admin on score_ledger
  for select
  using (is_admin());

-- --------------------------------------------------------------- flags

-- Admin only. A guest must not learn they have been flagged: it tells a
-- cheater exactly which control caught them.
create policy flags_read_admin on flags
  for select
  using (is_admin());

-- ---------------------------------------------------- comeback snapshot

-- Admin only (D5). Rule R11: guests never see a bottom ranking, and being able
-- to read this table would tell a guest they are in the bottom 25%.
create policy comeback_read_admin on comeback_snapshot
  for select
  using (is_admin());

-- ----------------------------------------------------------- audit log

create policy audit_read_admin on audit_log
  for select
  using (is_admin());

-- --------------------------------------------------------- staff users

create policy staff_read_self on staff_users
  for select
  using (auth_user_id = auth.uid());

create policy staff_read_admin on staff_users
  for select
  using (is_admin());

-- ---------------------------------------------------------- the views

-- Deliberately NOT security_invoker. Both views aggregate across every guest,
-- so with the caller's privileges a guest would see only their own row and the
-- leaderboard would come back with one entry. They stay owner-privileged and
-- are reachable only from inside the SECURITY DEFINER functions.
--
-- So no client select grant on either: the guest app reads the board through
-- the top10() function in 003, which returns the ten rows and nothing else.
revoke all on guest_scores from anon, authenticated;
revoke all on top10        from anon, authenticated;

-- Clients may not touch the tables directly either. Belt and braces alongside
-- the missing write policies: this way a direct insert fails on privileges
-- even if someone later adds a policy by mistake.
revoke all on config, starters, guests, guest_credentials, connections,
              score_ledger, flags, comeback_snapshot, audit_log, staff_users
  from anon, authenticated;

grant select on config, starters to anon, authenticated;
grant select on guests, connections, score_ledger, flags,
                comeback_snapshot, audit_log, staff_users
  to authenticated;

commit;
