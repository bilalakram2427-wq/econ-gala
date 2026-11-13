-- Staff and admin.
--
-- Staff can check guests in and read out credentials. Nothing else.
-- Admin can do everything, and every admin action is written to the audit log.

begin;

create or replace function require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then raise exception 'UNAUTHENTICATED'; end if;
  return auth.uid();
end;
$$;

create or replace function require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'UNAUTHENTICATED'; end if;
  return auth.uid();
end;
$$;

-- -------------------------------------------------------------- staff

create or replace function staff_search_guests(p_q text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  needle text := btrim(coalesce(p_q, ''));
begin
  perform require_staff();

  return (
    select coalesce(json_agg(row_to_json(r) order by r.full_name), '[]'::json)
    from (
      select g.id as guest_id, g.reg_no, g.full_name, g.display_name,
             g.checked_in_at, g.opted_in_at, g.payment_status
      from guests g
      where needle = ''
         or g.full_name ilike '%' || needle || '%'
         or g.reg_no    ilike '%' || needle || '%'
      order by g.full_name
      limit 25
    ) r
  );
end;
$$;

-- Marks the guest checked in and returns their credentials, so the volunteer
-- can read them out. One guest at a time, never a list (D2).
--
-- Payment is NOT enforced here, on purpose (D12). The volunteer already sees
-- the payment status on the guest card — it comes back from
-- staff_search_guests — and an unverified guest is sent to whoever handled
-- payment verification. That is a human decision at a gate, and a hard block
-- here would only produce an unexplained failure on a volunteer's phone with
-- a queue behind it.
--
-- The payment status at the moment of check-in is written to the audit log,
-- so an unverified guest who was let in is still traceable afterwards.
-- Correcting the record itself is an admin action on the guests panel.
--
-- p_override is kept in the signature but no longer gates anything. It
-- survives so that the staff screen can flag a deliberate exception in the
-- audit log if we ever want that, without another migration.
create or replace function checkin(p_guest_id uuid, p_override boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id uuid := require_staff();
  g guests;
  pw text;
begin
  select * into g from guests where id = p_guest_id for update;
  if g.id is null then raise exception 'UNKNOWN_CODE'; end if;

  if g.checked_in_at is null then
    update guests
    set checked_in_at = now(), checked_in_by = staff_id
    where id = g.id;
  end if;

  -- The password is generated at import and stored only in Supabase Auth,
  -- which hashes it. We keep a readable copy in a staff-only side table so a
  -- volunteer can read it out; see the import script.
  select password into pw from guest_credentials where guest_id = g.id;

  insert into audit_log (actor, action, details)
  values (staff_id, 'checkin',
          json_build_object('guest_id', g.id, 'override', p_override,
                            'payment_status', g.payment_status));

  return json_build_object('reg_no', g.reg_no, 'password', pw);
end;
$$;

-- For someone who has lost their password. Does not check them in again.
create or replace function reveal_credentials(p_guest_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id uuid := require_staff();
  g guests;
  pw text;
begin
  select * into g from guests where id = p_guest_id;
  if g.id is null then raise exception 'UNKNOWN_CODE'; end if;

  select password into pw from guest_credentials where guest_id = g.id;

  insert into audit_log (actor, action, details)
  values (staff_id, 'reveal_credentials', json_build_object('guest_id', g.id));

  return json_build_object('reg_no', g.reg_no, 'password', pw);
end;
$$;

create or replace function staff_counters()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return (
    select json_build_object(
      'checked_in', count(*) filter (where checked_in_at is not null),
      'opted_in',   count(*) filter (where opted_in_at is not null),
      'total',      count(*)
    )
    from guests
  );
end;
$$;

-- -------------------------------------------------------------- admin

create or replace function admin_overview()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();
  return (
    select json_build_object(
      'state',   game_phase(),
      'paused',  is_paused(),
      'checked_in', (select count(*) from guests where checked_in_at is not null),
      'opted_in',   (select count(*) from guests where opted_in_at is not null),
      'connections_completed', (select count(*) from connections where status = 'completed'),
      'connections_pending',   (select count(*) from connections where status = 'pending'),
      'connections_active',    (select count(*) from connections where status = 'active'),
      'connections_per_minute', (
        select count(*) from connections
        where status = 'completed' and completed_at > now() - interval '1 minute'
      ),
      'open_flags', (select count(*) from flags where status = 'open')
    )
  );
end;
$$;

-- The state machine. Transitions are linear and the server refuses any jump
-- (spec section 5). GAME -> COMEBACK takes the snapshot atomically.
create or replace function set_state(p_state game_state)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
  cur game_state := game_phase();
  allowed game_state[] := array[
    'SETUP','CHECKIN','GAME','COMEBACK','LOCKED','VERIFIED','REVEALED'
  ]::game_state[];
  cur_idx int;
  new_idx int;
begin
  select i into cur_idx from unnest(allowed) with ordinality t(s, i) where s = cur;
  select i into new_idx from unnest(allowed) with ordinality t(s, i) where s = p_state;

  if new_idx <> cur_idx + 1 then
    raise exception 'ILLEGAL_TRANSITION|% to %', cur, p_state;
  end if;

  if p_state = 'COMEBACK' then
    perform take_comeback_snapshot();
  end if;

  if p_state = 'LOCKED' then
    -- Nothing unfinished scores.
    update connections set status = 'expired' where status in ('pending', 'active');
    update guests set active_connection_id = null where active_connection_id is not null;
  end if;

  update config set value = p_state::text where key = 'game_state';

  insert into audit_log (actor, action, details)
  values (admin_id, 'set_state', json_build_object('from', cur, 'to', p_state));

  return json_build_object('state', p_state);
end;
$$;

create or replace function pause(p_paused boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
begin
  update config set value = case when p_paused then 'true' else 'false' end
  where key = 'paused';

  insert into audit_log (actor, action, details)
  values (admin_id, 'pause', json_build_object('paused', p_paused));

  return json_build_object('paused', p_paused);
end;
$$;

-- Runs once, inside the GAME -> COMEBACK transition. Admin eyes only (D5).
create or replace function take_comeback_snapshot()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  pct int := cfg_int('comeback_percent');
  pool_size int;
  take int;
begin
  delete from comeback_snapshot;

  select count(*) into pool_size
  from guest_scores s
  join guests g on g.id = s.guest_id
  where g.opted_in_at is not null
    and not s.is_organizer
    and not s.disqualified;

  take := ceil(pool_size * pct / 100.0);

  insert into comeback_snapshot (guest_id, score, connections, rank)
  select s.guest_id, s.score, s.connections,
         row_number() over (
           order by s.score asc, s.connections asc, s.last_completed_at desc nulls first
         )
  from guest_scores s
  join guests g on g.id = s.guest_id
  where g.opted_in_at is not null
    and not s.is_organizer
    and not s.disqualified
  order by s.score asc, s.connections asc, s.last_completed_at desc nulls first
  limit take;

  return json_build_object('pool', pool_size, 'flagged', take);
end;
$$;

create or replace function admin_comeback_list()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();
  return (
    select coalesce(json_agg(json_build_object(
      'guest_id', cs.guest_id,
      'display_name', g.display_name,
      'score', cs.score,
      'connections', cs.connections
    ) order by cs.rank), '[]'::json)
    from comeback_snapshot cs
    join guests g on g.id = cs.guest_id
  );
end;
$$;

create or replace function admin_leaderboard_full()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();
  return (
    select coalesce(json_agg(row_to_json(r) order by r.rank), '[]'::json)
    from (
      select row_number() over (
               order by s.score desc, s.connections desc, s.last_completed_at asc nulls last
             ) as rank,
             s.guest_id, s.display_name, s.score, s.connections,
             s.great_votes_received, s.flags_open,
             s.is_organizer, s.disqualified,
             (s.flags_open > 0) as under_review
      from guest_scores s
      join guests g on g.id = s.guest_id
      where g.opted_in_at is not null
    ) r
  );
end;
$$;

create or replace function admin_flags(p_status text default 'open')
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();
  return (
    select coalesce(json_agg(json_build_object(
      'id', f.id,
      'guest_id', f.guest_id,
      'guest_display_name', g.display_name,
      'connection_id', f.connection_id,
      'code', f.code,
      'severity', f.severity,
      'details', f.details,
      'status', f.status,
      'created_at', f.created_at
    ) order by f.created_at desc), '[]'::json)
    from flags f
    join guests g on g.id = f.guest_id
    where f.status = p_status
  );
end;
$$;

create or replace function resolve_flag(p_flag_id uuid, p_action text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
begin
  if p_action not in ('clear', 'confirm') then
    raise exception 'UNKNOWN';
  end if;

  update flags
  set status = case when p_action = 'clear' then 'cleared' else 'confirmed' end,
      resolved_by = admin_id,
      resolved_at = now()
  where id = p_flag_id;

  insert into audit_log (actor, action, details)
  values (admin_id, 'resolve_flag',
          json_build_object('flag_id', p_flag_id, 'action', p_action));

  return json_build_object('ok', true);
end;
$$;

-- A void is compensating negative ledger rows, never a delete (spec s10).
create or replace function void_connection(p_connection_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
  r record;
begin
  for r in
    select guest_id, sum(points) as pts
    from score_ledger
    where connection_id = p_connection_id
    group by guest_id
  loop
    insert into score_ledger (guest_id, connection_id, points, reason, created_by)
    values (r.guest_id, p_connection_id, -r.pts, 'void', admin_id::text);
  end loop;

  update connections
  set status = 'voided', void_reason = p_reason
  where id = p_connection_id;

  insert into audit_log (actor, action, details)
  values (admin_id, 'void_connection',
          json_build_object('connection_id', p_connection_id, 'reason', p_reason));

  return json_build_object('ok', true);
end;
$$;

create or replace function disqualify(p_guest_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
begin
  update guests set disqualified = true where id = p_guest_id;

  insert into audit_log (actor, action, details)
  values (admin_id, 'disqualify',
          json_build_object('guest_id', p_guest_id, 'reason', p_reason));

  return json_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------- grants

revoke all on function
  staff_search_guests, checkin, reveal_credentials, staff_counters,
  admin_overview, set_state, pause, take_comeback_snapshot, admin_comeback_list,
  admin_leaderboard_full, admin_flags, resolve_flag, void_connection, disqualify
  from public, anon;

grant execute on function
  staff_search_guests, checkin, reveal_credentials, staff_counters,
  admin_overview, set_state, pause, admin_comeback_list,
  admin_leaderboard_full, admin_flags, resolve_flag, void_connection, disqualify
  to authenticated;

-- take_comeback_snapshot is called only from inside set_state.
revoke all on function take_comeback_snapshot from authenticated;

commit;
