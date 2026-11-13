-- Rule tests. Spec section 19: "All rules R1 to R11 are enforced by server
-- tests." This is that test suite.
--
-- Run against a scratch database with the local shim loaded:
--   psql -d gala -v ON_ERROR_STOP=1 -f test/001_rules.sql
--
-- Each test prints PASS or raises. A raise stops the run, so the first
-- failure is the last line you see.

\set ON_ERROR_STOP on
\t on

create or replace function t_ok(p_label text)
returns void language plpgsql as $$
begin raise notice 'PASS  %', p_label; end;
$$;

-- Runs a statement and checks it raises the expected code.
create or replace function t_raises(p_sql text, p_code text, p_label text)
returns void language plpgsql as $$
declare got text;
begin
  begin
    execute p_sql;
    raise exception 'FAIL  % — expected %, but nothing was raised', p_label, p_code;
  exception
    when others then
      got := split_part(sqlerrm, '|', 1);
      if got = p_code then
        raise notice 'PASS  % (%)', p_label, p_code;
      elsif sqlerrm like 'FAIL%' then
        raise;
      else
        raise exception 'FAIL  % — expected %, got "%"', p_label, p_code, sqlerrm;
      end if;
  end;
end;
$$;

create or replace function as_guest(p_reg text)
returns void language plpgsql as $$
declare u uuid;
begin
  select auth_user_id into u from guests where reg_no = p_reg;
  perform set_config('test.uid', u::text, false);
end;
$$;

-- Makes a guest: auth id, credentials, checked in and opted in by default.
create or replace function mk_guest(
  p_reg text, p_name text, p_display text,
  p_checked_in boolean default true,
  p_opted_in boolean default true,
  p_organizer boolean default false
) returns uuid language plpgsql as $$
declare id uuid; au uuid := gen_random_uuid();
begin
  insert into guests (auth_user_id, reg_no, full_name, display_name,
                      payment_status, is_organizer,
                      checked_in_at, opted_in_at)
  values (au, p_reg, p_name, p_display, 'Verified', p_organizer,
          case when p_checked_in then now() - interval '1 hour' end,
          case when p_opted_in   then now() - interval '1 hour' end)
  returning guests.id into id;
  insert into guest_credentials (guest_id, password) values (id, 'pw' || left(p_reg, 4));
  return id;
end;
$$;

-- A full connection between two guests, back-dated so the chat timer has run.
create or replace function play(p_a text, p_b text,
                               p_vote_a vote default 'great',
                               p_vote_b vote default 'great')
returns uuid language plpgsql as $$
declare conn uuid;
begin
  perform as_guest(p_a);
  perform scan((select qr_short_code(id, floor(extract(epoch from now())/30)::bigint)
                from guests where reg_no = p_b));
  perform as_guest(p_b);
  perform scan((select qr_short_code(id, floor(extract(epoch from now())/30)::bigint)
                from guests where reg_no = p_a));

  select id into conn from guests where reg_no = p_a;
  select active_connection_id into conn from guests where reg_no = p_a;

  -- Back-date so the minimum chat time has passed.
  update connections set started_at = now() - interval '5 minutes' where id = conn;
  update guests set last_conn_started_at = now() - interval '5 minutes'
   where reg_no in (p_a, p_b);

  perform as_guest(p_a);
  perform submit(conn, 'Learned something genuinely interesting about them',
                 p_vote_a, gen_random_uuid());
  perform as_guest(p_b);
  perform submit(conn, 'They told me about a project they are working on',
                 p_vote_b, gen_random_uuid());
  return conn;
end;
$$;

-- ------------------------------------------------------------- set up

truncate score_ledger, flags, comeback_snapshot, audit_log,
         guest_credentials, connections, guests restart identity cascade;

update config set value = 'test-master-secret-for-local-runs'
 where key = 'secret.qr_master';
update config set value = 'GAME'  where key = 'game_state';
update config set value = 'false' where key = 'paused';

select mk_guest('FA24-BED-001', 'Ayesha Khan',    'Ayesha K.');
select mk_guest('FA24-BED-002', 'Hamza Siddiqui', 'Hamza S.');
select mk_guest('FA24-BED-003', 'Zara Mir',       'Zara M.');
select mk_guest('FA24-BED-004', 'Omar Farooq',    'Omar F.');
select mk_guest('SP26-ECO-071', 'Sana Tariq',     'Sana T.');
-- Logged in but never checked in: the gate case (D3).
select mk_guest('FA24-BED-999', 'Gate Blocked',   'Gate B.', false, false);
-- Checked in, has not accepted the consent text.
select mk_guest('FA24-BED-998', 'Not Opted',      'Not O.',  true,  false);
-- Plays but cannot win (R1).
select mk_guest('FA24-ORG-001', 'Organizer One',  'Org O.',  true,  true, true);

-- ---------------------------------------------------------------- R1

select t_raises(
  $$select as_guest('FA24-BED-999'); select get_qr();$$,
  'NOT_CHECKED_IN',
  'R1/D3  a logged-in guest who is not checked in cannot act');

select t_raises(
  $$select as_guest('FA24-BED-998'); select get_qr();$$,
  'NOT_OPTED_IN',
  'R1     a checked-in guest who has not opted in cannot act');

-- me() must still answer for both, so the app can show the right screen.
do $$
begin
  perform as_guest('FA24-BED-999');
  if (me() ->> 'checked_in')::boolean then
    raise exception 'FAIL  me() reports checked_in for a guest at the gate';
  end if;
  perform t_ok('D3     me() answers for a guest at the gate, with checked_in false');
end;
$$;

-- ---------------------------------------------------------------- R2

do $$
declare conn uuid; pts int;
begin
  conn := play('FA24-BED-001', 'FA24-BED-002', 'great', 'great');
  select sum(points) into pts from score_ledger
   where connection_id = conn and guest_id = (select id from guests where reg_no='FA24-BED-001');
  if pts <> 2 then raise exception 'FAIL  R2 mutual great should score 2, got %', pts; end if;
  perform t_ok('R2     mutual great scores 2 per person');
end;
$$;

do $$
declare conn uuid; pts int;
begin
  conn := play('FA24-BED-003', 'FA24-BED-004', 'great', 'skip');
  select sum(points) into pts from score_ledger
   where connection_id = conn and guest_id = (select id from guests where reg_no='FA24-BED-003');
  if pts <> 1 then raise exception 'FAIL  R2 one-sided great should score 1, got %', pts; end if;
  perform t_ok('R2     one-sided great scores 1 per person');
end;
$$;

-- ---------------------------------------------------------------- R3

select t_raises(
  $$select as_guest('FA24-BED-001');
    select scan((select qr_short_code(id, floor(extract(epoch from now())/30)::bigint)
                 from guests where reg_no = 'FA24-BED-002'));$$,
  'ALREADY_CONNECTED',
  'R3     a pair can only connect once, ever');

-- ---------------------------------------------------------------- R4

do $$
declare code text;
begin
  -- Clear cooldowns so this tests BUSY and not COOLDOWN.
  update guests set last_conn_started_at = null;

  perform as_guest('FA24-BED-001');
  select qr_short_code(id, floor(extract(epoch from now())/30)::bigint) into code
    from guests where reg_no = 'SP26-ECO-071';
  perform scan(code);   -- creates a pending connection

  -- A second pending connection while one is live must be refused.
  select qr_short_code(id, floor(extract(epoch from now())/30)::bigint) into code
    from guests where reg_no = 'FA24-BED-003';
  begin
    perform scan(code);
    raise exception 'FAIL  R4 allowed a second pending connection';
  exception when others then
    if split_part(sqlerrm, '|', 1) <> 'BUSY' then raise; end if;
  end;
  perform t_ok('R4     only one pending or active connection at a time');

  -- Tidy up for the next test.
  update connections set status = 'expired' where status = 'pending';
end;
$$;

-- ---------------------------------------------------------------- R5

do $$
declare code text;
begin
  update guests set last_conn_started_at = now() - interval '10 seconds'
   where reg_no = 'FA24-BED-001';
  perform as_guest('FA24-BED-001');
  select qr_short_code(id, floor(extract(epoch from now())/30)::bigint) into code
    from guests where reg_no = 'SP26-ECO-071';
  begin
    perform scan(code);
    raise exception 'FAIL  R5 allowed a scan inside the cooldown';
  exception when others then
    if split_part(sqlerrm, '|', 1) <> 'COOLDOWN' then raise; end if;
  end;
  perform t_ok('R5     cooldown between connection starts is enforced');
end;
$$;

do $$
declare conn uuid; code text;
begin
  update guests set last_conn_started_at = null;
  update connections set status = 'expired' where status in ('pending','active');
  update guests set active_connection_id = null;

  perform as_guest('FA24-BED-001');
  select qr_short_code(id, floor(extract(epoch from now())/30)::bigint) into code
    from guests where reg_no = 'FA24-BED-004';
  perform scan(code);
  perform as_guest('FA24-BED-004');
  select qr_short_code(id, floor(extract(epoch from now())/30)::bigint) into code
    from guests where reg_no = 'FA24-BED-001';
  perform scan(code);

  select active_connection_id into conn from guests where reg_no = 'FA24-BED-001';
  perform as_guest('FA24-BED-001');
  begin
    -- Started seconds ago: too early to submit.
    perform submit(conn, 'We talked about absolutely nothing at all', 'great', gen_random_uuid());
    raise exception 'FAIL  R5 allowed a submit before the minimum chat time';
  exception when others then
    if split_part(sqlerrm, '|', 1) <> 'TOO_EARLY' then raise; end if;
  end;
  perform t_ok('R5     minimum conversation time is enforced');
end;
$$;

-- ---------------------------------------------------------------- R6

do $$
declare conn uuid;
begin
  select active_connection_id into conn from guests where reg_no = 'FA24-BED-001';
  update connections set started_at = now() - interval '5 minutes' where id = conn;
  perform as_guest('FA24-BED-001');

  begin
    perform submit(conn, 'too short', 'great', gen_random_uuid());
    raise exception 'FAIL  R6 accepted text under the minimum length';
  exception when others then
    if sqlerrm <> 'INVALID_TEXT' then raise; end if;
  end;
  perform t_ok('R6     text under 15 characters is rejected');

  begin
    perform submit(conn, repeat('x', 200), 'great', gen_random_uuid());
    raise exception 'FAIL  R6 accepted text over the maximum length';
  exception when others then
    if sqlerrm <> 'INVALID_TEXT' then raise; end if;
  end;
  perform t_ok('R6     text over 140 characters is rejected');

  begin
    perform submit(conn, 'Omar F.', 'great', gen_random_uuid());
    raise exception 'FAIL  R6 accepted the partner name as the text';
  exception when others then
    if sqlerrm <> 'INVALID_TEXT' then raise; end if;
  end;
  perform t_ok('R6     the partner display name alone is rejected');
end;
$$;

-- ---------------------------------------------------------------- R8

do $$
declare conn uuid; n int;
begin
  select active_connection_id into conn from guests where reg_no = 'FA24-BED-001';
  perform as_guest('FA24-BED-001');
  perform submit(conn, 'Only one of us has submitted so far today', 'great', gen_random_uuid());

  select count(*) into n from score_ledger where connection_id = conn;
  if n <> 0 then raise exception 'FAIL  R8 scored on a one-sided submission'; end if;
  perform t_ok('R8     one-sided submission scores nothing');

  if (select status from connections where id = conn) <> 'active' then
    raise exception 'FAIL  R8 connection should still be active';
  end if;
  perform t_ok('R8     connection stays active until both sides submit');
end;
$$;

-- --------------------------------------------------------- idempotency

do $$
declare conn uuid; key uuid := gen_random_uuid(); n int; r json;
begin
  select active_connection_id into conn from guests where reg_no = 'FA24-BED-004';
  perform as_guest('FA24-BED-004');

  r := submit(conn, 'They explained their thesis topic to me clearly', 'great', key);
  -- Same key again: must return the stored answer, not score twice.
  r := submit(conn, 'Completely different text on the retry attempt', 'skip', key);

  select count(*) into n from score_ledger where connection_id = conn;
  if n <> 4 then
    raise exception 'FAIL  double submit produced % ledger rows, expected 4', n;
  end if;
  perform t_ok('       a repeated idempotency key does not score twice');
end;
$$;

-- --------------------------------------------------------------- R11

do $$
declare board json;
begin
  perform as_guest('FA24-BED-001');
  board := top10();
  if board::text like '%Org O.%' then
    raise exception 'FAIL  R1/R11 an organizer appears on the public leaderboard';
  end if;
  perform t_ok('R1     organizers are excluded from the leaderboard');
end;
$$;

-- ------------------------------------------------------ phase and pause

do $$
begin
  update config set value = 'true' where key = 'paused';
  perform as_guest('FA24-BED-001');
  begin
    perform scan('123456');
    raise exception 'FAIL  a scan was accepted while paused';
  exception when others then
    if sqlerrm <> 'PHASE_CLOSED' then raise; end if;
  end;
  perform t_ok('       scanning is refused while the game is paused');
  update config set value = 'false' where key = 'paused';

  update config set value = 'LOCKED' where key = 'game_state';
  begin
    perform scan('123456');
    raise exception 'FAIL  a scan was accepted after LOCKED';
  exception when others then
    if sqlerrm <> 'PHASE_CLOSED' then raise; end if;
  end;
  perform t_ok('       scanning is refused outside GAME and COMEBACK');
  update config set value = 'GAME' where key = 'game_state';
end;
$$;

-- -------------------------------------------------------------- QR

do $$
declare g uuid; w bigint; tok text;
begin
  select id into g from guests where reg_no = 'FA24-BED-001';
  w := floor(extract(epoch from now()) / 30);

  if verify_qr(qr_token(g, w)) <> g then
    raise exception 'FAIL  a current-window token did not verify';
  end if;
  perform t_ok('       a current-window QR token verifies');

  if verify_qr(qr_token(g, w - 1)) <> g then
    raise exception 'FAIL  a previous-window token did not verify';
  end if;
  perform t_ok('       the previous window is still accepted');

  begin
    perform verify_qr(qr_token(g, w - 5));
    raise exception 'FAIL  an old token was accepted';
  exception when others then
    if sqlerrm <> 'QR_EXPIRED' then raise; end if;
  end;
  perform t_ok('       an old QR token is refused');

  -- A forged signature over a real guest id must not verify.
  tok := split_part(qr_token(g, w), '.', 1) || '.AAAAAAAAAAAAAA';
  begin
    perform verify_qr(tok);
    raise exception 'FAIL  a forged QR token was accepted';
  exception when others then
    if sqlerrm not in ('UNKNOWN_CODE', 'QR_EXPIRED') then raise; end if;
  end;
  perform t_ok('       a forged QR signature is refused');
end;
$$;

-- --------------------------------------------------------- scan self

select t_raises(
  $$select as_guest('FA24-BED-001');
    select scan((select qr_short_code(id, floor(extract(epoch from now())/30)::bigint)
                 from guests where reg_no = 'FA24-BED-001'));$$,
  'UNKNOWN_CODE',
  '       scanning your own code is refused');

-- -------------------------------------------------- ledger is the truth

do $$
declare from_ledger int; from_me int;
begin
  perform as_guest('FA24-BED-001');
  select coalesce(sum(points),0) into from_ledger from score_ledger
   where guest_id = (select id from guests where reg_no = 'FA24-BED-001');
  from_me := (me() ->> 'score')::int;
  if from_ledger <> from_me then
    raise exception 'FAIL  me() score % does not match the ledger %', from_me, from_ledger;
  end if;
  perform t_ok('       every point shown comes from the ledger');
end;
$$;

\echo ''
\echo 'All rule tests passed.'
