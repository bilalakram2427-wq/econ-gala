-- Assign the staff role from the admin guests panel, instead of SQL.
--
-- Why: volunteers are assigned on the night, not days ahead. Someone drops
-- out, someone else steps in, and you need to hand them the check-in screen
-- at 4:40pm with guests already arriving. Opening a database console on a
-- phone at that moment is not a plan.
--
-- Deliberately staff only. Promoting someone to ADMIN stays a SQL job: an
-- admin can end the game, disqualify people and void connections, and that
-- should never be one mis-tap away on a screen being used in a hurry.

begin;

-- ------------------------------------------- show the role in the roster

-- admin_guest_list gains staff_role: 'staff', 'admin', or null for most
-- people. The panel needs it to show who already has the check-in screen.
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
        su.role as staff_role,
        case
          when g.checked_in_at is not null and g.opted_in_at is not null then 'playing'
          when g.checked_in_at is not null then 'checked_in'
          else 'not_arrived'
        end as arrival,
        coalesce(s.score, 0) as score,
        coalesce(s.connections, 0) as connections
      from guests g
      left join guest_scores s on s.guest_id = g.id
      left join staff_users su on su.auth_user_id = g.auth_user_id
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

-- Count how many people can work the gate, so the panel can show it.
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
      'unpaid',      count(*) filter (where payment_status is distinct from 'Verified'),
      'staff',       (select count(*) from staff_users)
    )
    from guests
  );
end;
$$;

-- ------------------------------------------------- grant / revoke staff

-- Give a guest the check-in screen, or take it away. Their guest account is
-- untouched either way: they keep playing, keep their score, keep everything.
--
-- Two guards:
--   - refuses on a guest with no auth account (nothing to link a role to)
--   - refuses to touch anyone who is already an ADMIN, so this button can
--     never quietly demote an organiser who is running the game
create or replace function set_staff_role(p_guest_id uuid, p_is_staff boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
  g        guests;
  existing text;
begin
  select * into g from guests where id = p_guest_id;
  if g.id is null then raise exception 'UNKNOWN_CODE'; end if;

  if g.auth_user_id is null then
    -- Imported but never given a login. Nothing to attach a role to.
    raise exception 'NO_ACCOUNT';
  end if;

  select role into existing from staff_users where auth_user_id = g.auth_user_id;

  if existing = 'admin' then
    raise exception 'IS_ADMIN';
  end if;

  if p_is_staff then
    insert into staff_users (auth_user_id, name, role)
    values (g.auth_user_id, g.full_name, 'staff')
    on conflict (auth_user_id) do update set role = 'staff', name = excluded.name;
  else
    delete from staff_users where auth_user_id = g.auth_user_id;
  end if;

  insert into audit_log (actor, action, details)
  values (admin_id, 'set_staff_role',
          json_build_object('guest_id', g.id,
                            'reg_no', g.reg_no,
                            'is_staff', p_is_staff));

  return json_build_object('ok', true, 'staff_role',
                           case when p_is_staff then 'staff' else null end);
end;
$$;

-- --------------------------------------------------------------- grants

revoke all on function set_staff_role from public, anon;
grant execute on function set_staff_role to authenticated;

commit;
