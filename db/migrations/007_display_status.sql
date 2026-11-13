-- Public game status, for the display screen.
--
-- Why this exists: the big screen needs the phase and a countdown, but it runs
-- on an unattended laptop plugged into a projector. It has no guest session and
-- must not have an admin one — leaving an admin login open on a machine in a
-- public space would be worse than having no countdown at all.
--
-- me() is guest-only and admin_overview() is admin-only, so before this there
-- was no way for the display to know the phase. That was a gap in the API, not
-- a mistake by whoever built the screen.
--
-- What it leaks: the phase, which the host announces out loud, and whether the
-- game is paused, which is visible to 250 people anyway. No scores, no names,
-- no counts.

begin;

-- When the current round ends, for the countdown in the corner. Empty means no
-- countdown — which is the right default, because the game starts when an
-- admin presses GAME, not at a time decided days earlier.
--
-- Set it on the night, once the round actually starts:
--   update config set value = '2026-11-19T18:30:00+05:00' where key = 'round_ends_at';
--
-- And push it back if you pause for ten minutes. Spec section 17 says paused
-- time is added back to the round, so the countdown has to be adjustable.
insert into config (key, value, note)
values ('round_ends_at', '',
        'ISO timestamp for the display countdown. Empty = no countdown shown.')
on conflict (key) do nothing;

create or replace function display_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return json_build_object(
    'state',         game_phase(),
    'paused',        is_paused(),
    'round_ends_at', nullif(cfg('round_ends_at'), ''),
    -- So the screen can correct for a laptop clock that is minutes out.
    'server_time',   now()
  );
end;
$$;

-- Public on purpose: the display has no session at all.
grant execute on function display_status to anon, authenticated;

-- And the leaderboard itself, which 003 granted only to `authenticated`.
--
-- That was a bug: the display laptop is not signed in as anyone, so it is the
-- `anon` role, and the board would have failed with a permissions error all
-- evening while the screen said "waiting for the first connections".
--
-- Safe to make public. top10() returns rank, display name and score for ten
-- people — the exact contents of a screen pointed at the whole party. It
-- already excludes organizers, disqualified guests, anyone under review and
-- anyone who opted out of the board.
grant execute on function top10 to anon;

commit;
