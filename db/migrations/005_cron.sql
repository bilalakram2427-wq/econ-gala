-- Housekeeping.
--
-- Two jobs. Expiry frees guests whose partner walked away, and without it a
-- guest who scanned someone who never scanned back would be stuck for the
-- rest of the night.
--
-- pg_cron must be enabled in the Supabase dashboard first:
--   Database -> Extensions -> pg_cron -> enable.

begin;

create extension if not exists pg_cron;

-- Pending connections older than the TTL, and active ones past the submit
-- deadline. Both free the guests involved.
create or replace function expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  freed uuid[];
begin
  update connections
  set status = 'expired'
  where status = 'pending'
    and scanned_at <= now() - make_interval(secs => cfg_int('pending_scan_ttl_seconds'));

  with done as (
    update connections
    set status = 'expired'
    where status = 'active'
      and started_at <= now() - make_interval(secs => cfg_int('submit_deadline_seconds'))
    returning id, guest_lo, guest_hi
  )
  select array_agg(x) into freed
  from (select guest_lo as x from done union all select guest_hi from done) s;

  if freed is not null then
    update guests
    set active_connection_id = null
    where id = any(freed)
      and active_connection_id is not null
      and not exists (
        select 1 from connections c
        where c.id = guests.active_connection_id and c.status = 'active'
      );
  end if;
end;
$$;

revoke all on function expire_stale from public, anon, authenticated;

select cron.schedule(
  'expire-stale-connections',
  '15 seconds',
  $$select expire_stale()$$
);

commit;
