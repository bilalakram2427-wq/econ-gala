# Econ Gala Networking Game: Technical Specification

Spec v1.0 for the Econ Ascent tech team. Event: Econ Gala, Thursday 19 November 2026, open-air park, about 250 guests. Game window 5:25 to 6:30 PM (Asia/Karachi).

## 1. Summary

A mobile web app (PWA, no install) where guests earn points by meeting new people. A connection only counts when both people are physically present (live rotating QR, mutual scan), actually talk (minimum timer, icebreaker, a typed note on what they learned), and both submit. Scores exist only on the server. A live top 10 runs on a big screen. After the main round, the lowest 25% get a private comeback mission and a dare wheel. Organizers verify the top 3 before awards.

Non-goals: no star ratings of people, no public bottom ranking, no chat feature, no photo upload, no native app.

Design principles:

- The server is the only authority. The client never sends a score, and client timestamps are ignored.
- Every point traces to an append-only ledger row.
- Cheating should be unprofitable and detectable, not merely forbidden.
- Degrade gracefully on bad networks (manual fallback, section 17).
- Minimal personal data, deleted after the event.

## 2. Constraints and assumptions

- About 250 concurrent users on phones (iOS Safari, Android Chrome), outdoors, on mobile data that may congest.
- Volume is small: at most about 16 connections per guest in the main round, so roughly 2,000 connections in total. Correctness and rule enforcement matter far more than scale.
- Short build window and AI agents write most of the code, so this spec fixes contracts, constraints and tests explicitly.
- Low budget: free or low tiers only, no SMS.
- A guest list exists (Google Sheet): full name, phone (optional), payment status. It is imported as CSV.
- UI language is English. All times are stored as timestamptz and shown in Asia/Karachi.

## 3. Roles and surfaces

- Guest: mobile PWA. Sees own QR, own score and connection count, the live top 10, and own mission.
- Staff (check-in volunteers): limited admin. Can check guests in and reissue login links. Nothing else.
- Admin (president and tech leads): full control, MFA required.
- Display: read-only big-screen page showing the top 10 and a countdown.

## 4. Game rules (authoritative)

Configuration values live in a config table. Defaults are listed after the rules.

- R1 Eligibility. A guest must be checked in and opted in. Organizers (is\_organizer = true) can play but are excluded from prizes and from the comeback pool. Disqualified guests cannot score.
- R2 Scoring. A completed connection gives each person +1. If both voted great conversation, each gets +1 more. Maximum 2 points per connection per person.
- R3 Uniqueness. A pair of guests can complete at most one connection, ever.
- R4 One at a time. A guest can have only one pending or active connection at once.
- R5 Pacing. At least 180 s between the start times of a guest’s consecutive connections, and at least 120 s of conversation before submitting. During the comeback round these become 120 s and 60 s.
- R6 Submission. Each person types what they learned about the other (15 to 140 characters) and votes great or skip. There are no negative votes and no numeric ratings.
- R7 Cap. At most 20 connections are scored per guest.
- R8 Both sides required. No points unless both submit within 10 minutes of the connection starting.
- R9 Comeback. At the start of the comeback round, the lowest 25% of eligible guests are flagged and receive a private mission: complete 3 new connections before the round ends.
- R10 Winners. Prizes: most points, most connections, most great votes received. Ties are broken by fewer flags, then earlier last-connection time.
- R11 Visibility. Guests see only their own score and connection count. They never see their rank or anyone else’s score, apart from the public top 10.

Config defaults:

```
qr_window_seconds = 30
pending_scan_ttl_seconds = 90
min_chat_seconds_game = 120
min_chat_seconds_comeback = 60
cooldown_seconds_game = 180
cooldown_seconds_comeback = 120
submit_deadline_seconds = 600
points_new_connection = 1
points_mutual_great_bonus = 1
max_scored_connections = 20
comeback_percent = 25
comeback_eligible_opt_in_before = 17:40
mission_target = 3
learned_text_min = 15
learned_text_max = 140
leaderboard_top_n = 10
max_attempts_per_pair = 3
```

## 5. Phases (state machine)

States: SETUP, CHECKIN, GAME, COMEBACK, LOCKED, VERIFIED, REVEALED. PAUSED is an overlay that can be applied during GAME or COMEBACK and removed again. Pause freezes timers and rejects scans.

Target times (admins trigger transitions manually, the clock is not a trigger): CHECKIN opens 4:30, GAME 5:25 to 6:15, COMEBACK 6:15 to 6:30, LOCKED at 6:30, VERIFIED by 7:00, REVEALED at the awards.

Rules:

- Scans and submissions are accepted only in GAME and COMEBACK.
- The server rejects any transition that skips a state.
- The transition GAME to COMEBACK runs the comeback snapshot (section 14) atomically.
- LOCKED freezes the ledger except for admin voids.

## 6. Architecture

Recommended stack (substitutes are fine if they keep the rules in sections 4 and 18):

- Frontend: React PWA (Vite or Next.js), mobile first, deployed on Vercel.
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions, pg\_cron), region Mumbai or Singapore.
- QR scanning: browser camera with BarcodeDetector, falling back to the jsQR library. HTTPS is mandatory for camera access.
- Display and admin: the same app under /display and /admin routes with separate auth.

Principles:

- Row Level Security denies all client writes. Every mutation goes through SECURITY DEFINER Postgres functions (RPC) or Edge Functions.
- Game logic lives in Postgres functions inside transactions with row locks. No game logic in the client.
- Realtime is used only for notifications (a partner scanned you, a connection completed) and the leaderboard. The source of truth is always a fetch.

Components: guest PWA, staff check-in screen, admin dashboard, display screen, Postgres (tables, RPCs, views), pg\_cron jobs (expire stale rows every 15 s, refresh the top 10 every 5 s), audit log.

## 7. Identity and login

No passwords and no SMS. Login is a one-time link handed out at check-in.

1. Staff search the guest list, check the guest’s ID against the name, and tap Check in.
2. The server marks checked\_in\_at and returns a one-time claim URL, shown as a QR on the staff device. The token is 128-bit random, only its hash is stored, it is single use, and it expires in 10 minutes.
3. The guest scans it with their phone camera, which opens the PWA. The server consumes the token, bumps guests.session\_version, and issues a session (a JWT carrying guest\_id and session\_version).
4. The guest taps Join the game and accepts a short consent text (what data is used, and that the leaderboard shows first name and last initial). This sets opted\_in\_at.

Rules: there is one active session per guest, because every new claim invalidates older sessions through session\_version. A lost phone is fixed by staff reissuing a claim. The device\_id (a random UUID in local storage) is recorded for duplicate-device detection. Guests without smartphones use the manual fallback in section 17.

## 8. Rotating QR codes

Each guest’s QR encodes a signed token that changes every 30 seconds.

- Token: base64url(public\_id + window\_index), a dot, then base64url of the first 10 bytes of HMAC\_SHA256(guest\_key, public\_id + window\_index). guest\_key = HMAC\_SHA256(server\_master\_secret, guest\_id) and window\_index = floor(unix\_time / 30).
- Verification happens on the server only: recompute the HMAC and accept a window\_index equal to the current or previous window.
- Short code: the same HMAC reduced to 6 digits, shown under the QR for when the camera fails. Rate limited to 5 attempts per minute per guest.
- Delivery: GET /api/qr returns the current token and the next window’s token. The client caches both so a brief network drop does not blank the QR. A token for the next window is only valid once that window starts.

Honest limitation: rotating codes defeat screenshots and later replays. They cannot stop a colluder relaying a live code to a friend who is not present. That residual risk is handled by pacing limits, mutual submission and the detection rules in section 13.

## 9. Core flow

1. Guest A opens Scan and scans guest B’s live QR (or types the short code).
2. The scan RPC validates everything in section 11. If no pending connection from B exists, it creates a pending connection (A as initiator) and notifies B in real time: A wants to connect, scan their code back.
3. B scans A’s live QR. The same scan RPC finds the pending connection from A, verifies pacing for both, and starts the connection: status active, a random unused icebreaker is chosen, started\_at is set, and active\_connection\_id is set on both guests.
4. Both phones show the icebreaker, the partner’s display name (so they can confirm they are with the right person), and a countdown to the minimum chat time. Submit stays disabled until the timer ends and the text meets the length rule.
5. Each side submits the learned text and a vote with an idempotency key. After the first submit the UI shows a waiting-for-partner state.
6. When both have submitted within the deadline, the server completes the connection, writes ledger rows, clears the active flags, runs the fraud checks, and pushes the result to both phones.

Edge cases:

- Pending connection not confirmed in 90 s: expired, and A is free to retry.
- Active connection with no submission from either side in 10 minutes: expired, nobody scores, both are freed, and the pair may retry (max 3 attempts per pair).
- One side submitted and the other did not: expired, no points. Show a nudge to the partner before the deadline.
- A scans B while B scans A at the same instant: the row locks make one request win and the other idempotent.
- Phase change mid-connection (GAME to COMEBACK): the connection keeps the rules of the phase it started in. At LOCKED, unfinished connections are expired.

## 10. Data model (Postgres)

```
create type game_state as enum ('SETUP','CHECKIN','GAME','COMEBACK','LOCKED','VERIFIED','REVEALED');
create type conn_status as enum ('pending','active','completed','expired','voided');
create type vote as enum ('great','skip');

create table guests (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  full_name text not null,
  display_name text not null,
  is_organizer boolean not null default false,
  checked_in_at timestamptz,
  opted_in_at timestamptz,
  show_on_leaderboard boolean not null default true,
  session_version int not null default 0,
  device_id text,
  disqualified boolean not null default false,
  last_conn_started_at timestamptz,
  active_connection_id uuid,
  created_at timestamptz not null default now()
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  guest_lo uuid not null references guests(id),
  guest_hi uuid not null references guests(id),
  initiator uuid not null references guests(id),
  status conn_status not null default 'pending',
  phase game_state not null,
  icebreaker_id int references icebreakers(id),
  attempt int not null default 1,
  scanned_at timestamptz not null default now(),
  started_at timestamptz,
  lo_text text, hi_text text,
  lo_vote vote, hi_vote vote,
  lo_submitted_at timestamptz, hi_submitted_at timestamptz,
  completed_at timestamptz,
  under_review boolean not null default false,
  check (guest_lo < guest_hi)
);
create unique index uniq_pair_live_or_done
  on connections (guest_lo, guest_hi)
  where status in ('pending','active','completed');

create table score_ledger (
  id bigint generated always as identity primary key,
  guest_id uuid not null references guests(id),
  connection_id uuid references connections(id),
  points int not null,
  reason text not null,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);
```

Ledger reasons: new\_connection, mutual\_great, void, manual\_adjust. A guest’s score is the sum of their ledger rows. Voids are compensating negative rows, never deletes.

Other tables:

- icebreakers (id, text, active): about 40 prompts, loaded before the event.
- config (key, value): the values in section 4, plus the current game\_state and the paused flag.
- claim\_tokens (token\_hash, guest\_id, expires\_at, used\_at).
- missions (id, guest\_id, target, started\_at, deadline, completed\_at, dare\_status).
- wheel\_segments (id, label, kind: dare, prize or pass, weight, active).
- spins (id, guest\_id, purpose, segment\_id, rng\_seed, created\_at).
- flags (id, guest\_id, connection\_id, code, severity, details jsonb, status: open, cleared or confirmed, created\_at, resolved\_by).
- audit\_log (id, at, actor, action, details jsonb). Append-only.

Views: guest\_scores (score, completed connections, great votes received, flagged count) and top10 (rank, display\_name, score; only guests with show\_on\_leaderboard, not organizers, not disqualified, not under review).

Locking order: always lock the two guest rows ordered by id, then the connection row. This prevents deadlocks.

## 11. Server logic (RPCs)

scan(code), pseudocode:

```
require session valid (session_version matches), state in (GAME, COMEBACK), not paused
me = caller; target = verify_qr(code)   -- HMAC and window check
require target <> me, both opted in, neither disqualified
lock guests me, target ordered by id
require pair attempts < max_attempts_per_pair
require no completed or active connection for the pair
if exists pending connection with initiator = target for this pair and age < pending_ttl:
    require neither guest has an active connection
    require now - last_conn_started_at >= cooldown for both
    set connection active, started_at = now, pick icebreaker
    set active_connection_id on both, update last_conn_started_at
    return active payload
else:
    require me has no active connection and cooldown ok
    insert pending connection (initiator = me)
    notify target
    return pending payload
```

submit(connection\_id, learned\_text, vote, idempotency\_key), pseudocode:

```
lock connection FOR UPDATE; require caller in pair and status = active
require now - started_at >= min_chat for the phase
require now - started_at <= submit_deadline
sanitize learned_text: trim, strip HTML, collapse whitespace, 15 to 140 chars,
  not equal to partner display name, not an exact repeat of caller earlier texts
if caller already submitted: return stored result (idempotent)
store text, vote, submitted_at
if both submitted:
    status = completed, completed_at = now
    ledger: +1 each (new_connection); +1 each more if both votes are great (mutual_great)
    skip scoring beyond max_scored_connections
    clear active_connection_id for both
    run fraud checks (section 13)
return waiting or completed payload
```

Other RPCs: checkin(guest\_id), claim(token), optin(), get\_qr(), me(), top10(), comeback\_snapshot() (called by the state transition), spin(mission\_id), and the admin RPCs (set\_state, pause, resolve\_flag, void\_connection, disqualify, reissue\_claim, adjust\_points, export).

pg\_cron jobs: every 15 s expire pending connections (older than 90 s) and active ones (older than the deadline) and free the guests; every 5 s refresh the top 10 cache.

## 12. API contract

Auth: bearer session token for guests, staff and admins (separate roles in the JWT). All responses are JSON. Write endpoints that matter accept an idempotency\_key.

Guest endpoints:

- POST /api/claim: body token. Returns session and guest profile.
- POST /api/optin: body consent: true. Returns ok.
- GET /api/me: returns display\_name, state, paused, score, connections\_count, active\_connection (if any), and mission (target, progress, deadline, dare\_status) if flagged.
- GET /api/qr: returns token, short\_code, window\_ends\_at, next\_token, next\_starts\_at.
- POST /api/scan: body code. Returns status pending (connection\_id, partner display\_name, expires\_at) or status active (connection\_id, partner display\_name, icebreaker, min\_chat\_seconds, started\_at, submit\_by).
- GET /api/connections/{id}: returns status and the caller’s own submission state. The partner’s text is never returned.
- POST /api/connections/{id}/submit: body learned\_text, vote (great or skip), idempotency\_key. Returns status waiting\_partner, or completed (points\_awarded, new\_total).
- GET /api/leaderboard/top: up to 10 rows (rank, display\_name, score).
- POST /api/mission/spin: allowed once per mission and only when the dare is due. Returns the segment label.

Staff endpoints: GET /api/staff/guests?q=, POST /api/staff/checkin (guest\_id, returns claim\_url and expires\_at), POST /api/staff/reissue (guest\_id).

Admin endpoints: POST /api/admin/state, POST /api/admin/pause, GET /api/admin/overview, GET /api/admin/flags, POST /api/admin/flags/{id}/resolve, POST /api/admin/connections/{id}/void, POST /api/admin/guests/{id}/disqualify, GET /api/admin/leaderboard/full, GET /api/admin/missions, POST /api/admin/manual-connection (fallback entry, flagged manual), GET /api/admin/export.csv, GET /api/admin/audit.

Display: GET /api/display/top10 with a read-only display token, plus a realtime channel.

Error format: HTTP status plus a body with error (code), message, and optional retry\_after\_seconds. Codes:

- 401 UNAUTHENTICATED
- 403 PHASE\_CLOSED, NOT\_OPTED\_IN, DISQUALIFIED
- 404 UNKNOWN\_CODE
- 409 ALREADY\_CONNECTED, BUSY, COOLDOWN (with retry\_after\_seconds)
- 410 QR\_EXPIRED, CONNECTION\_EXPIRED
- 422 INVALID\_TEXT
- 425 TOO\_EARLY (with wait\_seconds)
- 429 RATE\_LIMITED

Rate limits: scan 6 per minute per guest, short-code attempts 5 per minute, submit 10 per minute, QR fetch 6 per minute, claim 10 per minute per IP.

## 13. Anti-cheat

Threat model. Each threat lists the control and the detection.

- Fake or duplicate accounts and shared entries. Control: login only through staff check-in with an ID check, one session per guest, one guest per list entry. Detection: duplicate device\_id across guests raises DEVICE\_SHARED.
- Screenshots of QR codes. Control: 30 s rotating signed tokens, and only the current and previous window are accepted.
- Scoring without talking. Control: mutual scan, minimum chat timer, typed learned text, both sides must submit. Detection: INSTANT\_SUBMIT when both submit within 10 s of the minimum time across 5 or more connections.
- Copy-paste or low-effort text. Control: length rule, no repeats of own text, text cannot equal the partner’s name. Detection: TEXT\_SIMILARITY when trigram similarity is above 0.8 between a guest’s texts across 3 or more connections, or when two partners’ texts about each other are identical.
- Collusion rings and friend farming. Control: each pair counts once, pacing limits throughput, and the cap of 20 scored connections. Detection: CLIQUE when a guest with 6 or more connections has a local clustering coefficient above 0.8 (most of their partners also connected to each other). An informational MUTUAL\_GREAT\_100 flag fires when someone with 8 or more connections has only mutual great votes.
- Speed tapping and bots. Control: rate limits, cooldown, server-side timing. Detection: BURST for more than 6 scans per minute.
- Client tampering and direct database writes. Control: RLS denies writes, all logic in RPCs, scores computed from the ledger, server clock only.
- Replay and double submit. Control: idempotency keys, the unique pair index, and status checks under row locks.
- Insider abuse. Control: admin actions go through audited RPCs, the ledger is append-only, organizers are excluded from prizes, and two admins verify the top 3.
- Optional soft signal: geolocation at scan time with the distance to the venue centre. Log only and never block, because phone GPS is inaccurate and consent is required.

Policy: flagged connections get under\_review = true. They still show on the guest’s own screen but are excluded from the public top 10 and from prize ranking until an admin clears them. Admins can void a connection (compensating ledger rows) or disqualify a guest from prizes. Every decision is written to the audit log.

Verification SOP before awards (during dinner, between LOCKED and VERIFIED): for each of the top 5 in each category, review the connection list, the timing graph, the learned texts and open flags. Clear or confirm, and have a second admin sign off.

## 14. Comeback round and dare wheel

Snapshot (runs once, atomically, on GAME to COMEBACK):

1. Eligible pool: opted in before comeback\_eligible\_opt\_in\_before, not an organizer, not disqualified.
2. Sort by score ascending, then connections ascending, then later first-connection time, then a random order seeded with a stored seed so the result is reproducible.
3. Flag the first ceil(25% of the pool) guests. Create a mission row for each with target 3, started\_at now, and the deadline at the end of the round.
4. Store the cutoff. Guests who were not flagged never see this feature.

Mission progress: completed connections whose completed\_at falls inside the mission window. A mission completes when progress reaches 3. At LOCKED, guests with incomplete missions get dare\_status = due.

Wheel: the guest opens the wheel screen and the server selects a segment by weighted crypto-random choice and logs the seed. The spin animation is cosmetic and always lands on the server’s result. Dares must be light, funny and never humiliating, for example singing one line with the singer, telling a joke at the mic, or giving three compliments to strangers. Each guest may pass once with no penalty (dare\_status = passed). A staff member taps done when the dare is performed. The same wheel can pay out small prizes to award winners (purpose = award). Segments are config, loaded before the event.

## 15. Frontend screens

Brand: ivory #F3EEE5, bronze #7A5C2E, deep green #14201B. Cormorant Garamond for headings and Jost for body. Tap targets at least 48 px, high contrast, readable outdoors at full brightness.

Guest app:

- Claim and Join: consent text and display name preview.
- Home: large rotating QR with a visible 30 s ring, the short code beneath, score and connection count, game state banner with countdown, and a Scan button.
- Scan: camera view with a torch toggle and a manual short-code entry link.
- Waiting for partner’s scan: pending state with a 90 s countdown and a cancel button.
- Conversation: partner’s name, icebreaker, a countdown to unlock, text input with character counter, Great conversation and Skip buttons, then a waiting-for-partner state.
- Result: points-awarded animation and the updated total.
- Mission: progress 0 of 3 and a countdown, shown only to flagged guests, with a friendly tone (comeback mission, not punishment).
- Wheel and dare card.
- Top 10: read-only.
- System states: no-connection banner, paused banner, game-closed screen, session expired, and camera-denied help.

Never show a guest’s rank outside the top 10, other guests’ scores, or any bottom list.

Staff check-in: search box, guest card, Check in button, the claim QR, a reissue button, and counters for checked-in and opted-in guests.

Display (big screen): live top 10 with first name, last initial and score, a phase banner, a countdown, and a join QR for late arrivals. Auto-reconnecting, no interaction needed, and a dark theme that stays readable in daylight and at dusk.

## 16. Admin dashboard

- Overview: checked-in, opted-in, connections per minute, completed total, pending, open flags, error rate.
- Game control: state buttons with confirmation dialogs, pause and resume, and a countdown to the next scheduled phase.
- Guests: search, reissue login, disqualify, mark organizer.
- Flags queue: details, the connection pair, texts and timing side by side, with clear, confirm or void actions.
- Leaderboard: full ranking with toggles for organizers and under-review rows.
- Comeback: pool size, cutoff score, flagged list, mission progress, dare status.
- Wheel: segments and weights.
- Export (CSV of guests, connections and ledger) and an audit log viewer.

Roles: admin (everything) and staff (check-in only).

## 17. Reliability, performance and fallback

- Keep payloads under 5 KB. A service worker caches the app shell. Retries use exponential backoff with idempotency keys.
- Expected peak load is a few requests per second. Load test target: 250 simulated users, 20 requests per second, p95 under 500 ms.
- Connectivity: test at the exact park position with a few phones beforehand. Consider a portable Wi-Fi router or two as a local network, and put the admin team on a separate connection.
- Pause button: freezes timers and rejects scans if the network or app degrades. Time spent paused is added back to the round.
- Manual fallback: pre-printed stamp cards (20 boxes). A guest meets a person and both sign a box. Staff at a table, or an admin after the event, record these through the manual-connection endpoint. They are flagged manual and reviewed. Use this for guests with no smartphone or during an outage.
- Backups: a database backup right before the event, and a CSV export at LOCKED and at VERIFIED.
- Monitoring: error logs, a simple uptime check on the app and the API, and an on-call tech person at the venue.

## 18. Security and privacy

- RLS on every table. Clients read only their own rows, through views. There are no insert, update or delete policies for clients.
- Secrets (master HMAC secret, service keys) live only in server environment variables, never in the client bundle. Rotate them after the event.
- Server time is the only clock. Ignore any client timestamp.
- Sanitize all user text on write and escape on render to prevent XSS. Length limits are enforced in the database as well.
- CORS locked to the app domain, HTTPS only, secure httpOnly cookies or short-lived bearer tokens, and CSRF protection for cookie sessions.
- Admin and staff accounts use strong passwords and MFA, with separate roles in the JWT.
- Data minimization: store full name, optional phone, device\_id and the game data. No contact details are shown to other guests. Display names are first name and last initial.
- Retention: delete phone numbers, device\_ids and learned texts within 7 days after the event. Keep anonymized aggregate stats for the society.
- A consent text is shown at Join the game, covering the data used, leaderboard visibility and the retention period.

## 19. Testing and acceptance

Unit tests: scoring math, pacing windows for both phases, pair uniqueness, comeback ranking with ties, ledger sums, token generation and verification.

Integration tests (database and API): the full happy path, double submit, expired pending, one-sided submit, two simultaneous scans, scanning yourself, scan outside a phase, scan with an old token, submit too early, submit too late, a session invalidated by a new claim, and a client attempting a direct table write (must fail).

Adversarial scenarios (scripted bots): speed-tapping, screenshot replay, copy-pasted texts, a ring of 8 colluding accounts, and one device on two accounts. Each must either be blocked or produce the expected flag.

Load test: 250 simulated users for 10 minutes using k6 or Playwright workers.

Rehearsal: 15 to 20 real people at the real venue at least 3 days before, running the full game including the comeback round and the wheel.

Acceptance criteria:

- No score can change except through the ledger.
- All rules R1 to R11 are enforced by server tests.
- Every flag type triggers in the adversarial suite.
- p95 API latency is under 500 ms at 250 users.
- Check-in takes under 30 seconds per guest.
- The app recovers from a 60 s network drop without data loss.

## 20. Build plan for AI agents

Suggested repo layout: /db (migrations, RLS, RPC functions, seed data, tests), /apps/guest (PWA), /apps/admin, /apps/display, /packages/shared (types, config constants, API client), /tests (integration, adversarial, load), /docs.

Milestones (each ends with passing tests):

1. Database: schema, RLS, RPCs for claim, optin, qr, scan and submit, the expiry cron, ledger, views and seed data. Test suite for rules R1 to R8.
2. Auth and check-in: staff screen, claim flow, session invalidation, guest list CSV import.
3. Guest app: home with rotating QR, scan, conversation, result, top 10 and error states.
4. Admin and display: game control, flags queue, leaderboard and the display screen.
5. Comeback and wheel: snapshot, missions, spin and dare tracking.
6. Anti-cheat detection jobs and the adversarial test suite.
7. Hardening: rate limits, load test, backups, runbook dry run and rehearsal.

Milestone 1 gates everything. After it, the guest app, admin app and display can be built in parallel against the shared API client.

Rules for agents:

- Never compute or accept a score on the client, and never write to tables from the client.
- Every rule in section 4 needs a test before the code counts as done.
- Prefer SQL functions with explicit transactions and row locks over application code for game logic.
- Do not add features that are not in this spec without approval.
- Keep configuration in the config table, not hardcoded.
- Log every admin action to the audit log.

## 21. Event-day runbook

- T minus 7 days: feature freeze, import the guest list, load icebreakers and wheel segments, create admin and staff accounts.
- T minus 3 days: rehearsal with 15 to 20 people, fix issues, final load test.
- T minus 1 day: database backup, clear test data, confirm domain and HTTPS, print stamp cards, charge phones and power banks.
- Event day before 4:30: smoke test, confirm the display screen, set the state to SETUP and then CHECKIN at 4:30.
- 4:30 to 5:25: check-in, guests join the game. Staff watch the opted-in counter.
- 5:25: set GAME. The display shows the countdown and the live top 10.
- 6:15: set COMEBACK (the snapshot runs). Staff announce the missions.
- 6:30: set LOCKED, export CSV, and start verification.
- By 7:00: set VERIFIED after the SOP in section 13, and hand the winners to the host.
- Awards: set REVEALED and show the final top 3 per category.
- T plus 1 to 7 days: export final data, delete personal data per section 18, and share the results with the society.

## 22. Open decisions

1. Final dare list and wheel weights (owner: president).
2. Prize list per award category (budget is low).
3. Whether to use geolocation as a soft signal.
4. Whether guests see only their own connection count or also a progress bar toward a target.
5. Number of icebreakers to prepare (recommend 40).
6. Hosting accounts and the domain name.
