-- The game. Every one of these runs as the table owner and bypasses RLS, so
-- each starts by establishing who is calling and whether they may act.
--
-- Errors are raised with the MESSAGE set to one of the codes from spec
-- section 12, optionally followed by a pipe and a number of seconds:
-- `COOLDOWN|47`. lib/api.ts parses exactly that.
--
-- Locking order, always: the two guest rows ordered by id, then the connection
-- row. Taking them in any other order deadlocks when two people scan each
-- other at the same instant (spec section 10).

begin;

-- ------------------------------------------------------------- helpers

create or replace function cfg(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from config where key = p_key;
$$;

create or replace function cfg_int(p_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select value::int from config where key = p_key;
$$;

create or replace function game_phase()
returns game_state
language sql
stable
security definer
set search_path = public
as $$
  select cfg('game_state')::game_state;
$$;

create or replace function is_paused()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cfg('paused') = 'true', false);
$$;

-- Minimum conversation length and cooldown both change in COMEBACK (D5).
create or replace function min_chat_seconds(p_phase game_state)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when p_phase = 'COMEBACK'
    then cfg_int('min_chat_seconds_comeback')
    else cfg_int('min_chat_seconds_game')
  end;
$$;

create or replace function cooldown_seconds(p_phase game_state)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when p_phase = 'COMEBACK'
    then cfg_int('cooldown_seconds_comeback')
    else cfg_int('cooldown_seconds_game')
  end;
$$;

-- The caller's guests row, with the gate checks applied in a fixed order.
-- Every game function starts here; this is where D3 is enforced.
create or replace function require_playable_guest()
returns guests
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g guests;
begin
  select * into g from guests where auth_user_id = auth.uid();

  if g.id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- THE GATE. A valid login is not permission to play; a volunteer must have
  -- checked them in against their physical ID first.
  if g.checked_in_at is null then
    raise exception 'NOT_CHECKED_IN';
  end if;

  if g.disqualified then
    raise exception 'DISQUALIFIED';
  end if;

  if g.opted_in_at is null then
    raise exception 'NOT_OPTED_IN';
  end if;

  return g;
end;
$$;

create or replace function require_playable_phase()
returns game_state
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p game_state := game_phase();
begin
  if p not in ('GAME', 'COMEBACK') or is_paused() then
    raise exception 'PHASE_CLOSED';
  end if;
  return p;
end;
$$;

-- ----------------------------------------------------------- rate limit

-- Crude but sufficient: count recent rows in the audit log. At ~250 guests and
-- a handful of actions each per minute this is cheap, and it keeps the limit
-- in one place rather than in every function.
create or replace function check_rate_limit(
  p_guest_id uuid,
  p_action   text,
  p_max      int,
  p_window_seconds int default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n
  from audit_log
  where actor = p_guest_id
    and action = p_action
    and at > now() - make_interval(secs => p_window_seconds);

  if n >= p_max then
    raise exception 'RATE_LIMITED|%', p_window_seconds;
  end if;

  insert into audit_log (actor, action) values (p_guest_id, p_action);
end;
$$;

-- ----------------------------------------------------------------- qr

-- Token: base64url(guest public part + window index).base64url(hmac prefix).
-- The secret never leaves the database. Verification recomputes it, so a
-- client cannot mint a token for anyone, including itself.
create or replace function qr_token(p_guest_id uuid, p_window bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  master  text := cfg('secret.qr_master');
  payload text := p_guest_id::text || ':' || p_window::text;
  sig     bytea;
begin
  if master is null then
    raise exception 'UNKNOWN';  -- misconfigured; never show a guest a reason
  end if;
  sig := hmac(payload, master, 'sha256');
  return translate(encode(convert_to(payload, 'utf8'), 'base64'), E'+/=\n', '-_')
      || '.'
      || translate(encode(substring(sig from 1 for 10), 'base64'), E'+/=\n', '-_');
end;
$$;

-- Six digits from the same HMAC, for when a camera will not cooperate.
create or replace function qr_short_code(p_guest_id uuid, p_window bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  master text := cfg('secret.qr_master');
  sig    bytea;
begin
  sig := hmac(p_guest_id::text || ':' || p_window::text, master, 'sha256');
  return lpad(((get_byte(sig,0)::bigint << 24 | get_byte(sig,1)::bigint << 16
              | get_byte(sig,2)::bigint << 8  | get_byte(sig,3)::bigint)
              % 1000000)::text, 6, '0');
end;
$$;

-- Returns the current token AND the next one, so a brief network drop never
-- blanks the QR on a guest's phone (spec section 8).
create or replace function get_qr()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g guests := require_playable_guest();
  w int    := cfg_int('qr_window_seconds');
  idx bigint := floor(extract(epoch from now()) / w);
  window_end timestamptz := to_timestamp((idx + 1) * w);
begin
  perform check_rate_limit(g.id, 'qr', 12);

  return json_build_object(
    'token',           qr_token(g.id, idx),
    'short_code',      qr_short_code(g.id, idx),
    'window_ends_at',  window_end,
    'next_token',      qr_token(g.id, idx + 1),
    'next_starts_at',  window_end
  );
end;
$$;

-- Resolve a scanned token or a typed short code back to a guest id.
-- Accepts the current and the previous window only.
create or replace function verify_qr(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w     int := cfg_int('qr_window_seconds');
  idx   bigint := floor(extract(epoch from now()) / w);
  code  text := trim(p_code);
  decoded text;
  target uuid;
  cand   uuid;
begin
  -- Short code path: six digits. Has to be checked against every checked-in
  -- guest, which is why it is rate limited harder than scanning.
  if code ~ '^[0-9]{6}$' then
    for cand in
      select id from guests where checked_in_at is not null and opted_in_at is not null
    loop
      if qr_short_code(cand, idx) = code or qr_short_code(cand, idx - 1) = code then
        return cand;
      end if;
    end loop;
    raise exception 'UNKNOWN_CODE';
  end if;

  -- Token path. Decode the payload, then recompute the signature over it.
  begin
    decoded := convert_from(
      decode(rpad(translate(split_part(code, '.', 1), '-_', '+/'),
                  ((length(split_part(code, '.', 1)) + 3) / 4) * 4, '='),
             'base64'),
      'utf8');
  exception when others then
    raise exception 'UNKNOWN_CODE';
  end;

  target := split_part(decoded, ':', 1)::uuid;

  if qr_token(target, idx) = code then
    return target;
  elsif qr_token(target, idx - 1) = code then
    return target;
  else
    -- Signature is fine but the window has passed: tell them to show it again.
    if split_part(decoded, ':', 2) ~ '^[0-9]+$' then
      raise exception 'QR_EXPIRED';
    end if;
    raise exception 'UNKNOWN_CODE';
  end if;
exception
  when invalid_text_representation then raise exception 'UNKNOWN_CODE';
end;
$$;

-- --------------------------------------------------------------- me()

-- Everything the guest app renders, in one call. Deliberately cheap: it is
-- polled by ~250 phones every 5 seconds, so it does one pass over the ledger
-- and one over connections, and nothing else.
create or replace function me()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g guests;
  phase game_state := game_phase();
  v_score int;
  v_connections int;
  active_json json;
  pending_json json;
begin
  select * into g from guests where auth_user_id = auth.uid();
  if g.id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Note: me() does NOT use require_playable_guest. A guest who is not yet
  -- checked in still needs this call to answer, so the app can show them the
  -- "see you at the gate" screen rather than an error.

  select coalesce(sum(points), 0) into v_score
  from score_ledger where guest_id = g.id;

  select count(*) into v_connections
  from connections
  where status = 'completed' and (guest_lo = g.id or guest_hi = g.id);

  select json_build_object(
    'connection_id',         c.id,
    'partner_display_name',  p.display_name,
    'starters',              (
      select coalesce(json_agg(s.text order by ord), '[]'::json)
      from unnest(c.starter_ids) with ordinality as u(sid, ord)
      join starters s on s.id = u.sid
    ),
    'min_chat_seconds',      min_chat_seconds(c.phase),
    'started_at',            c.started_at,
    'submit_by',             c.started_at + make_interval(secs => cfg_int('submit_deadline_seconds')),
    'i_submitted',           case when c.guest_lo = g.id
                               then c.lo_submitted_at is not null
                               else c.hi_submitted_at is not null end
  )
  into active_json
  from connections c
  join guests p on p.id = case when c.guest_lo = g.id then c.guest_hi else c.guest_lo end
  where c.id = g.active_connection_id and c.status = 'active';

  select json_build_object(
    'connection_id',        c.id,
    'partner_display_name', p.display_name,
    'expires_at',           c.scanned_at + make_interval(secs => cfg_int('pending_scan_ttl_seconds')),
    'i_initiated',          c.initiator = g.id
  )
  into pending_json
  from connections c
  join guests p on p.id = case when c.guest_lo = g.id then c.guest_hi else c.guest_lo end
  where c.status = 'pending'
    and (c.guest_lo = g.id or c.guest_hi = g.id)
    and c.scanned_at > now() - make_interval(secs => cfg_int('pending_scan_ttl_seconds'))
  limit 1;

  return json_build_object(
    'guest_id',           g.id,
    'reg_no',             g.reg_no,
    'display_name',       g.display_name,
    'state',              phase,
    'paused',             is_paused(),
    'checked_in',         g.checked_in_at is not null,
    'opted_in',           g.opted_in_at is not null,
    'score',              v_score,
    'connections_count',  v_connections,
    'active_connection',  active_json,
    'pending_connection', pending_json,
    'server_time',        now()
  );
end;
$$;

-- ------------------------------------------------------------- optin()

create or replace function optin()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g guests;
begin
  select * into g from guests where auth_user_id = auth.uid();
  if g.id is null then raise exception 'UNAUTHENTICATED'; end if;
  if g.checked_in_at is null then raise exception 'NOT_CHECKED_IN'; end if;
  if g.disqualified then raise exception 'DISQUALIFIED'; end if;

  update guests set opted_in_at = coalesce(opted_in_at, now()) where id = g.id;
  insert into audit_log (actor, action) values (g.id, 'optin');

  return json_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------------- scan()

-- The handshake. A scans B: if B already has a pending connection with A, the
-- connection starts for both. Otherwise A's scan creates the pending row and B
-- is told to scan back.
--
-- The row locks are the point of this function. Two people scanning each other
-- at the same instant must produce one connection, not two, and must not
-- deadlock.
create or replace function scan(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me_g      guests;
  v_phase   game_state;
  target_id uuid;
  lo        uuid;
  hi        uuid;
  first_id  uuid;
  second_id uuid;
  conn      connections;
  attempts  int;
  cool      int;
  me_last   timestamptz;
  tg_last   timestamptz;
  tg_active uuid;
  tg_name   text;
  chosen    int[];
begin
  me_g  := require_playable_guest();
  v_phase := require_playable_phase();

  perform check_rate_limit(me_g.id, 'scan', cfg_int('rate_scan_per_min'));

  target_id := verify_qr(p_code);

  if target_id = me_g.id then
    raise exception 'UNKNOWN_CODE';
  end if;

  lo := least(me_g.id, target_id);
  hi := greatest(me_g.id, target_id);

  -- Lock both guest rows in id order. Always this order, everywhere.
  first_id  := lo;
  second_id := hi;
  perform 1 from guests where id = first_id  for update;
  perform 1 from guests where id = second_id for update;

  -- Re-read the target under the lock: they may have been disqualified or
  -- picked up another connection between the scan and now.
  select display_name, active_connection_id, last_conn_started_at
    into tg_name, tg_active, tg_last
  from guests
  where id = target_id
    and checked_in_at is not null
    and opted_in_at is not null
    and not disqualified;

  if tg_name is null then
    raise exception 'NOT_OPTED_IN';
  end if;

  -- R3: one completed connection per pair, ever.
  if exists (
    select 1 from connections
    where guest_lo = lo and guest_hi = hi and status = 'completed'
  ) then
    raise exception 'ALREADY_CONNECTED';
  end if;

  select count(*) into attempts
  from connections where guest_lo = lo and guest_hi = hi;

  if attempts >= cfg_int('max_attempts_per_pair') then
    raise exception 'ALREADY_CONNECTED';
  end if;

  -- Expire any pending row for this pair that has outlived its TTL, so the
  -- unique index does not block a legitimate retry.
  update connections
  set status = 'expired'
  where guest_lo = lo and guest_hi = hi
    and status = 'pending'
    and scanned_at <= now() - make_interval(secs => cfg_int('pending_scan_ttl_seconds'));

  -- Did the other person already scan me?
  select * into conn
  from connections
  where guest_lo = lo and guest_hi = hi
    and status = 'pending'
    and initiator = target_id
  for update;

  if conn.id is not null then
    -- Both have now scanned: start the connection.
    if me_g.active_connection_id is not null or tg_active is not null then
      raise exception 'BUSY';
    end if;

    cool    := cooldown_seconds(v_phase);
    me_last := me_g.last_conn_started_at;

    if me_last is not null and me_last > now() - make_interval(secs => cool) then
      raise exception 'COOLDOWN|%',
        ceil(extract(epoch from (me_last + make_interval(secs => cool)) - now()));
    end if;
    if tg_last is not null and tg_last > now() - make_interval(secs => cool) then
      raise exception 'COOLDOWN|%',
        ceil(extract(epoch from (tg_last + make_interval(secs => cool)) - now()));
    end if;

    -- Three prompts (D6), chosen by the server so both phones agree.
    select array_agg(id) into chosen
    from (select id from starters where active order by random() limit 3) s;

    -- The local is v_phase, not phase: an unqualified `phase` on the right
    -- of the assignment would resolve to the column and silently no-op.
    update connections c2
    set status = 'active',
        started_at = now(),
        starter_ids = chosen,
        phase = v_phase
    where c2.id = conn.id;

    update guests
    set active_connection_id = conn.id,
        last_conn_started_at = now()
    where id in (lo, hi);

    insert into audit_log (actor, action, details)
    values (me_g.id, 'connection_started',
            json_build_object('connection_id', conn.id, 'partner', target_id));

    return json_build_object(
      'status',               'active',
      'connection_id',        conn.id,
      'partner_display_name', tg_name,
      'starters',             (
        select coalesce(json_agg(s.text order by ord), '[]'::json)
        from unnest(chosen) with ordinality as u(sid, ord)
        join starters s on s.id = u.sid
      ),
      'min_chat_seconds',     min_chat_seconds(v_phase),
      'started_at',           now(),
      'submit_by',            now() + make_interval(secs => cfg_int('submit_deadline_seconds'))
    );
  end if;

  -- No pending row from them, so this scan creates one.
  if me_g.active_connection_id is not null then
    raise exception 'BUSY';
  end if;

  -- A guest may only have one pending connection at a time (R4).
  if exists (
    select 1 from connections
    where status = 'pending'
      and (guest_lo = me_g.id or guest_hi = me_g.id)
      and scanned_at > now() - make_interval(secs => cfg_int('pending_scan_ttl_seconds'))
  ) then
    raise exception 'BUSY';
  end if;

  cool := cooldown_seconds(v_phase);
  if me_g.last_conn_started_at is not null
     and me_g.last_conn_started_at > now() - make_interval(secs => cool) then
    raise exception 'COOLDOWN|%',
      ceil(extract(epoch from (me_g.last_conn_started_at + make_interval(secs => cool)) - now()));
  end if;

  insert into connections (guest_lo, guest_hi, initiator, status, phase, attempt)
  values (lo, hi, me_g.id, 'pending', v_phase, attempts + 1)
  returning * into conn;

  return json_build_object(
    'status',               'pending',
    'connection_id',        conn.id,
    'partner_display_name', tg_name,
    'expires_at',           conn.scanned_at + make_interval(secs => cfg_int('pending_scan_ttl_seconds')),
    'i_initiated',          true
  );
end;
$$;

-- ------------------------------------------------------ cancel_pending()

create or replace function cancel_pending(p_connection_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g guests := require_playable_guest();
begin
  update connections
  set status = 'expired'
  where id = p_connection_id
    and status = 'pending'
    and initiator = g.id;

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------ submit()

-- Both sides must submit within the deadline for anyone to score (R8).
-- Idempotent: the same key twice returns the stored answer rather than
-- scoring again.
create or replace function submit(
  p_connection_id   uuid,
  p_learned_text    text,
  p_vote            vote,
  p_idempotency_key uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g        guests;
  c        connections;
  is_lo    boolean;
  txt      text;
  min_len  int := cfg_int('learned_text_min');
  max_len  int := cfg_int('learned_text_max');
  elapsed  int;
  min_chat int;
  deadline int := cfg_int('submit_deadline_seconds');
  partner_id uuid;
  partner_name text;
  each_guest uuid;
  both_in  boolean;
  pts      int := 0;
  total    int;
  cap      int := cfg_int('max_scored_connections');
  scored   int;
begin
  g := require_playable_guest();
  perform check_rate_limit(g.id, 'submit', cfg_int('rate_submit_per_min'));

  -- Lock the guest rows first (id order), then the connection. Same order as
  -- scan(), which is what stops the two deadlocking against each other.
  select * into c from connections where id = p_connection_id;
  if c.id is null then raise exception 'CONNECTION_EXPIRED'; end if;

  perform 1 from guests where id = c.guest_lo for update;
  perform 1 from guests where id = c.guest_hi for update;
  select * into c from connections where id = p_connection_id for update;

  if g.id not in (c.guest_lo, c.guest_hi) then
    raise exception 'CONNECTION_EXPIRED';
  end if;

  is_lo := (c.guest_lo = g.id);
  partner_id := case when is_lo then c.guest_hi else c.guest_lo end;

  -- Idempotency: same key, same answer, no second score.
  if (is_lo and c.lo_idempotency_key = p_idempotency_key)
     or (not is_lo and c.hi_idempotency_key = p_idempotency_key) then
    if c.status = 'completed' then
      select coalesce(sum(points), 0) into total from score_ledger where guest_id = g.id;
      select coalesce(sum(points), 0) into pts
      from score_ledger where guest_id = g.id and connection_id = c.id;
      return json_build_object('status', 'completed',
                               'points_awarded', pts, 'new_total', total);
    end if;
    return json_build_object(
      'status', 'waiting_partner',
      'submit_by', c.started_at + make_interval(secs => deadline));
  end if;

  if c.status <> 'active' then
    raise exception 'CONNECTION_EXPIRED';
  end if;

  min_chat := min_chat_seconds(c.phase);
  elapsed  := floor(extract(epoch from now() - c.started_at));

  -- R5: talk first.
  if elapsed < min_chat then
    raise exception 'TOO_EARLY|%', min_chat - elapsed;
  end if;

  -- R8: and not too late.
  if elapsed > deadline then
    update connections set status = 'expired' where id = c.id;
    update guests set active_connection_id = null
      where id in (c.guest_lo, c.guest_hi) and active_connection_id = c.id;
    raise exception 'CONNECTION_EXPIRED';
  end if;

  -- R6: sanitize and length-check. HTML is stripped here as well as escaped on
  -- render, because the display screen will show none of this but the admin
  -- flags queue will.
  txt := btrim(regexp_replace(regexp_replace(p_learned_text, '<[^>]*>', '', 'g'),
                              '\s+', ' ', 'g'));

  if length(txt) < min_len or length(txt) > max_len then
    raise exception 'INVALID_TEXT';
  end if;

  select display_name into partner_name from guests where id = partner_id;
  if lower(txt) = lower(partner_name) then
    raise exception 'INVALID_TEXT';
  end if;

  -- No exact repeat of something this guest already wrote about someone else.
  if exists (
    select 1 from connections x
    where x.status = 'completed'
      and ((x.guest_lo = g.id and lower(x.lo_text) = lower(txt))
        or (x.guest_hi = g.id and lower(x.hi_text) = lower(txt)))
  ) then
    raise exception 'INVALID_TEXT';
  end if;

  if is_lo then
    update connections
    set lo_text = txt, lo_vote = p_vote, lo_submitted_at = now(),
        lo_idempotency_key = p_idempotency_key
    where id = c.id
    returning * into c;
  else
    update connections
    set hi_text = txt, hi_vote = p_vote, hi_submitted_at = now(),
        hi_idempotency_key = p_idempotency_key
    where id = c.id
    returning * into c;
  end if;

  both_in := c.lo_submitted_at is not null and c.hi_submitted_at is not null;

  if not both_in then
    return json_build_object(
      'status', 'waiting_partner',
      'submit_by', c.started_at + make_interval(secs => deadline));
  end if;

  -- Both in. Complete it and write the ledger.
  update connections
  set status = 'completed', completed_at = now()
  where id = c.id;

  update guests set active_connection_id = null
  where id in (c.guest_lo, c.guest_hi);

  -- R2 and R7: +1 each, +1 more if both said great, and nothing past the cap.
  foreach each_guest in array array[c.guest_lo, c.guest_hi] loop
    select count(*) into scored
    from score_ledger
    where guest_id = each_guest and reason = 'new_connection';

    if scored < cap then
      insert into score_ledger (guest_id, connection_id, points, reason)
      values (each_guest, c.id, cfg_int('points_new_connection'), 'new_connection');

      if c.lo_vote = 'great' and c.hi_vote = 'great' then
        insert into score_ledger (guest_id, connection_id, points, reason)
        values (each_guest, c.id, cfg_int('points_mutual_great_bonus'), 'mutual_great');
      end if;
    end if;
  end loop;

  insert into audit_log (actor, action, details)
  values (g.id, 'connection_completed', json_build_object('connection_id', c.id));

  select coalesce(sum(points), 0) into total from score_ledger where guest_id = g.id;
  select coalesce(sum(points), 0) into pts
  from score_ledger where guest_id = g.id and connection_id = c.id;

  return json_build_object('status', 'completed',
                           'points_awarded', pts, 'new_total', total);
end;
$$;

-- ------------------------------------------------------------- top10()

-- A function rather than a plain view select, because the view aggregates over
-- every guest and RLS would otherwise cut it down to the caller's own row.
create or replace function top10()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(json_agg(json_build_object(
      'rank', rank, 'display_name', display_name, 'score', score
    ) order by rank), '[]'::json)
    from top10
  );
end;
$$;

-- --------------------------------------------------------------- grants

revoke all on function get_qr, me, optin, scan, submit, cancel_pending, top10
  from public;

grant execute on function me, optin, get_qr, scan, submit, cancel_pending, top10
  to authenticated;

-- The helpers are internal. Nothing outside these functions should call them,
-- and qr_token in particular must never be reachable by a client: it would
-- mint a valid code for any guest id.
revoke all on function qr_token, qr_short_code, verify_qr, cfg, cfg_int,
                       require_playable_guest, require_playable_phase,
                       check_rate_limit, min_chat_seconds, cooldown_seconds
  from public, anon, authenticated;

commit;
