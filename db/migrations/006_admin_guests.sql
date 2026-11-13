-- The admin guests panel.
--
-- Everything the spec's section 16 "Guests" page needs: the whole roster, who
-- has arrived, who has not, and the three things an admin may change about a
-- guest before or during the game.
--
-- Why these are admin and not staff:
--   - payment_status is a financial record. A volunteer at a gate who needs a
--     guest in uses checkin(..., override => true), which lets them play and
--     logs the override without touching the money trail. Correcting the
--     record itself is a deliberate act with a name attached.
--   - is_organizer decides who is excluded from prizes and the comeback pool.
--   - disqualified stops someone scoring at all.
--
-- All three write to the audit log.

begin;

-- ------------------------------------------------------- the roster

-- Every guest, with their arrival state. Unlike admin_leaderboard_full this
-- does NOT filter to opted-in guests: the point of this screen is seeing who
-- has not turned up.
--
-- arrival is one of:
--   'playing'     checked in and joined the game
--   'checked_in'  at the venue, has not joined yet
--   'not_arrived' no sign of them
create or replace function admin_guest_list(
  p_q       text default '',
  p_arrival text default 'all'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  needle text := btrim(coalesce(p_q, ''));
begin
  perform require_admin();

  return (
    select coalesce(json_agg(row_to_json(r) order by r.full_name), '[]'::json)
    from (
      select
        g.id as guest_id,
        g.reg_no,
        g.full_name,
        g.display_name,
        g.email,
        g.phone,
        g.payment_status,
        g.checked_in_at,
        g.opted_in_at,
        g.is_organizer,
        g.disqualified,
        case
          when g.checked_in_at is not null and g.opted_in_at is not null then 'playing'
          when g.checked_in_at is not null then 'checked_in'
          else 'not_arrived'
        end as arrival,
        coalesce(s.score, 0) as score,
        coalesce(s.connections, 0) as connections
      from guests g
      left join guest_scores s on s.guest_id = g.id
      where (needle = ''
             or g.full_name ilike '%' || needle || '%'
             or g.reg_no    ilike '%' || needle || '%'
             or g.email     ilike '%' || needle || '%')
        and (p_arrival = 'all'
             or (p_arrival = 'playing'     and g.checked_in_at is not null and g.opted_in_at is not null)
             or (p_arrival = 'checked_in'  and g.checked_in_at is not null and g.opted_in_at is null)
             or (p_arrival = 'not_arrived' and g.checked_in_at is null))
      order by g.full_name
    ) r
  );
end;
$$;

-- Counts for the filter chips, so the page can show "412 not arrived" without
-- fetching 412 rows to count them.
create or replace function admin_guest_counts()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();
  return (
    select json_build_object(
      'all',         count(*),
      'playing',     count(*) filter (where checked_in_at is not null and opted_in_at is not null),
      'checked_in',  count(*) filter (where checked_in_at is not null and opted_in_at is null),
      'not_arrived', count(*) filter (where checked_in_at is null),
      'unpaid',      count(*) filter (where payment_status is distinct from 'Verified')
    )
    from guests
  );
end;
$$;

-- --------------------------------------------------- the three writes

-- Corrects the payment record. Admin only, by design: a volunteer who needs
-- someone through the gate uses the override on checkin() instead, which does
-- not touch this field.
create or replace function set_payment_status(p_guest_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
  before   text;
begin
  if p_status is null or btrim(p_status) = '' then
    raise exception 'UNKNOWN';
  end if;

  select payment_status into before from guests where id = p_guest_id;
  if not found then raise exception 'UNKNOWN_CODE'; end if;

  update guests set payment_status = btrim(p_status) where id = p_guest_id;

  insert into audit_log (actor, action, details)
  values (admin_id, 'set_payment_status',
          json_build_object('guest_id', p_guest_id, 'from', before, 'to', btrim(p_status)));

  return json_build_object('ok', true, 'payment_status', btrim(p_status));
end;
$$;

-- Organizers play but are excluded from prizes and from the comeback pool
-- (R1). Has to be set before GAME starts to mean anything.
create or replace function set_organizer(p_guest_id uuid, p_is_organizer boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
begin
  update guests set is_organizer = p_is_organizer where id = p_guest_id;
  if not found then raise exception 'UNKNOWN_CODE'; end if;

  insert into audit_log (actor, action, details)
  values (admin_id, 'set_organizer',
          json_build_object('guest_id', p_guest_id, 'is_organizer', p_is_organizer));

  return json_build_object('ok', true, 'is_organizer', p_is_organizer);
end;
$$;

-- Undo for disqualify(), which only ever set the flag one way.
create or replace function set_disqualified(p_guest_id uuid, p_disqualified boolean, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
begin
  update guests set disqualified = p_disqualified where id = p_guest_id;
  if not found then raise exception 'UNKNOWN_CODE'; end if;

  insert into audit_log (actor, action, details)
  values (admin_id, 'set_disqualified',
          json_build_object('guest_id', p_guest_id,
                            'disqualified', p_disqualified,
                            'reason', p_reason));

  return json_build_object('ok', true, 'disqualified', p_disqualified);
end;
$$;

-- --------------------------------------------------------------- grants

revoke all on function admin_guest_list, admin_guest_counts,
                       set_payment_status, set_organizer, set_disqualified
  from public, anon;

grant execute on function admin_guest_list, admin_guest_counts,
                          set_payment_status, set_organizer, set_disqualified
  to authenticated;

commit;
