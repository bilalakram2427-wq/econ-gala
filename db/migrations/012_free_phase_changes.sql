-- Let an admin move between phases in any direction.
--
-- Before: set_state() only accepted the next phase in the list and refused
-- everything else with ILLEGAL_TRANSITION. That protected against a stray tap,
-- but it also meant a wrong press, or an event that runs late, could not be
-- undone from the screen. The society head asked for back and forth.
--
-- The accidental-tap protection now comes from the confirmation box on the
-- admin screen, which already asks "Set <phase>?" and says what it will do.
--
-- Behaviour:
--   - any phase to any other phase is allowed
--   - pressing the phase you are already in does nothing and is not an error
--   - entering COMEBACK records the bottom 25% again, from the scores at that
--     moment, so going back and forth never leaves a stale list
--   - entering LOCKED expires unfinished conversations, from wherever it was
--     pressed. They are not revived if you go back, guests simply start new ones.
--   - scores, connections and the ledger are never touched by a phase change
--
-- REVEALED puts the final top 10 on the big screen. Moving back from it does
-- not un-show anything people have already seen.

begin;

create or replace function set_state(p_state game_state)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := require_admin();
  cur game_state := game_phase();
begin
  if p_state is null then
    raise exception 'UNKNOWN';
  end if;

  -- Already there: nothing to do, nothing to log.
  if p_state = cur then
    return json_build_object('state', cur, 'changed', false);
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

  return json_build_object('state', p_state, 'changed', true);
end;
$$;

commit;
