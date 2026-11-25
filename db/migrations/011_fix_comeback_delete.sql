-- Fix: pressing COMEBACK failed with "DELETE requires a WHERE clause".
--
-- Supabase loads a safety extension (pg_safeupdate) for requests that come
-- through its API. It refuses any DELETE or UPDATE with no WHERE clause, and it
-- applies inside our functions too, not just to hand-typed queries.
-- take_comeback_snapshot() emptied its table with a bare
-- "delete from comeback_snapshot;", so the GAME -> COMEBACK transition was
-- refused and the phase could never move on.
--
-- A plain local Postgres has no such extension, so the local tests passed, and
-- the SQL Editor does not use the API role, so a hand-run delete worked too.
--
-- I scanned every DELETE and UPDATE in migrations 003 to 010. This was the
-- only one without a WHERE.
--
-- The function is identical except for "where true", which is the documented
-- way to say "all rows" to that extension.

begin;

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
  delete from comeback_snapshot where true;

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

revoke all on function take_comeback_snapshot from authenticated;

commit;
