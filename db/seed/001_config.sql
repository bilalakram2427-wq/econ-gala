-- Config defaults. Spec section 4, plus the runtime state.
--
-- Everything the game checks lives here, so a value can be changed on the
-- night without a deploy. Change one with:
--   update config set value = '90' where key = 'cooldown_seconds_game';
--
-- BEFORE THE EVENT: replace secret.qr_master with a real random value.
--   select gen_random_uuid() || gen_random_uuid();
-- and rotate it again afterwards (spec section 18).

insert into config (key, value, note) values
  ('game_state', 'SETUP', 'Current phase. Changed only through set_state().'),
  ('paused',     'false', 'Overlay on GAME and COMEBACK. Freezes scans.'),

  ('qr_window_seconds',        '30',  'How often each guest QR changes'),
  ('pending_scan_ttl_seconds', '90',  'How long a one-sided scan waits'),

  ('min_chat_seconds_game',     '120', 'R5, main round'),
  ('min_chat_seconds_comeback', '60',  'R5, comeback round'),
  ('cooldown_seconds_game',     '180', 'R5, between connection starts'),
  ('cooldown_seconds_comeback', '120', 'R5, comeback round'),
  ('submit_deadline_seconds',   '600', 'R8, both must submit within this'),

  ('points_new_connection',     '1',   'R2'),
  ('points_mutual_great_bonus', '1',   'R2, only when both vote great'),
  ('max_scored_connections',    '20',  'R7'),

  ('learned_text_min', '15',  'R6'),
  ('learned_text_max', '140', 'R6'),

  ('comeback_percent', '25', 'R9, bottom share flagged at the snapshot'),
  ('leaderboard_top_n', '10', 'R11'),
  ('max_attempts_per_pair', '3', 'Retries allowed after an expired attempt'),

  ('rate_scan_per_min',   '6',  'Spec section 12'),
  ('rate_submit_per_min', '10', 'Spec section 12'),

  ('secret.qr_master', 'CHANGE-ME-BEFORE-THE-EVENT',
   'HMAC key for QR tokens. Never readable by a client: the RLS policy on '
   'config excludes keys starting with secret.')
on conflict (key) do nothing;
