/**
 * Fake backend, so every screen can be built and tested before the real one
 * exists. Set NEXT_PUBLIC_USE_MOCKS=true in .env.local and all of this runs in
 * memory. It is a small state machine, not static JSON: log in, scan, wait out
 * the timer, submit, and your score goes up.
 *
 * ── Test logins ───────────────────────────────────────────────────────────
 *   FA24-BED-001 / test123    normal guest, checked in, opted in
 *   FA24-BED-002 / test123    checked in, NOT opted in  (consent screen)
 *   FA24-BED-999 / test123    logged in but NOT checked in ("see you at the gate")
 *   SP26-ECO-071 / test123    a different reg format — they vary, do not
 *                             validate the shape in the login form
 *   anything else             BAD_CREDENTIALS
 *
 * ── Test scan codes ───────────────────────────────────────────────────────
 *   111111   partner scans back after ~3s, then submits ~12s after the timer
 *   222222   partner never scans back; pending expires after 90s
 *   333333   ALREADY_CONNECTED
 *   444444   QR_EXPIRED
 *   555555   COOLDOWN, retry in 47s
 *   666666   RATE_LIMITED
 *   anything else   UNKNOWN_CODE
 *
 * ── Faking phases ─────────────────────────────────────────────────────────
 * The admin screen's state buttons really do change the phase for the whole
 * mock, so you can set LOCKED and watch the guest app show "game closed".
 */

import { ApiError } from './types';
import type {
  AdminGuestCounts, AdminGuestRow, AdminLeaderboardRow, AdminOverview, Arrival,
  ComebackRow, DisplayStatus, Flag, GameState, GuestCredentials, LeaderboardRow, MeResponse,
  QrResponse, ScanResponse, StaffCounters, StaffGuest, SubmitRequest,
  SubmitResponse,
} from './types';
import { GAME } from './config';

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));
const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString();

/* --------------------------------------------------- tiny persistence */

/** Survives a page refresh so you are not logged out every time you save. */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`mock:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`mock:${key}`, JSON.stringify(value));
  } catch {
    /* private window, blocked storage: fine, state is just in memory */
  }
}

/* ----------------------------------------------------------- the state */

const ACCOUNTS: Record<string, { checkedIn: boolean; optedIn: boolean; name: string }> = {
  'FA24-BED-001': { checkedIn: true, optedIn: true, name: 'Bilal R.' },
  'FA24-BED-002': { checkedIn: true, optedIn: false, name: 'Hamza S.' },
  'FA24-BED-999': { checkedIn: false, optedIn: false, name: 'Zara M.' },
  'SP26-ECO-071': { checkedIn: true, optedIn: true, name: 'Ayesha K.' },
};

const state = {
  regNo: '' as string,
  gameState: 'GAME' as GameState,
  paused: false,
  score: 6,
  connections: 4,
  optedInOverride: null as boolean | null,
  pending: null as null | { id: string; partner: string; expiresAt: number; backAt: number | null },
  active: null as null | {
    id: string; partner: string; startedAt: number;
    iSubmitted: boolean; partnerSubmitsAt: number;
  },
};

/** Restore the bits worth keeping across a refresh. */
function hydrate() {
  if (typeof window === 'undefined') return;
  state.regNo = load('regNo', '');
  state.score = load('score', 6);
  state.connections = load('connections', 4);
  state.optedInOverride = load<boolean | null>('optedIn', null);
}
hydrate();

const STARTERS = [
  'What is something you changed your mind about this year?',
  'Which subject would you teach if you had to teach one tomorrow?',
  'What is the best thing you have read lately?',
  'What is a small thing that always improves your day?',
  'Which class surprised you most this semester?',
  'If the gala had one more event, what should it be?',
];

function pickStarters(): string[] {
  const shuffled = [...STARTERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function account() {
  return ACCOUNTS[state.regNo] ?? ACCOUNTS['FA24-BED-001'];
}

/* ----------------------------------------------------------------- auth */

export async function login(regNo: string, password: string): Promise<void> {
  await delay(350);
  const key = regNo.trim().toUpperCase();
  if (!ACCOUNTS[key] || password !== 'test123') {
    throw new ApiError('BAD_CREDENTIALS', 'BAD_CREDENTIALS');
  }
  state.regNo = key;
  state.optedInOverride = null;
  save('regNo', key);
  save('optedIn', null);
}

export async function logout(): Promise<void> {
  await delay(120);
  state.regNo = '';
  save('regNo', '');
}

export async function isLoggedIn(): Promise<boolean> {
  return Boolean(state.regNo);
}

export async function optin() {
  await delay(250);
  state.optedInOverride = true;
  save('optedIn', true);
  return { ok: true as const };
}

/** Generic "it worked" for calls with nothing to simulate (flags, voids). */
export async function ok() {
  await delay(120);
  return { ok: true as const };
}

/**
 * Mirrors cancel_pending() in 003_game_functions.sql: only a pending
 * connection that matches the id is dropped, and anything else is a quiet
 * no-op that still returns ok. An active connection is never cancelled here.
 */
export async function cancelPending(connectionId: string) {
  await delay(120);
  if (state.pending && state.pending.id === connectionId) {
    state.pending = null;
  }
  return { ok: true as const };
}

/* ---------------------------------------------------------------- guest */

export async function me(): Promise<MeResponse> {
  await delay(120);
  if (!state.regNo) throw new ApiError('UNAUTHENTICATED', 'UNAUTHENTICATED');

  const acct = account();

  // The partner scans back and the connection goes active.
  if (state.pending?.backAt && Date.now() >= state.pending.backAt) {
    state.active = {
      id: state.pending.id,
      partner: state.pending.partner,
      startedAt: Date.now(),
      iSubmitted: false,
      partnerSubmitsAt: Date.now() + minChat() * 1000 + 12_000,
    };
    state.pending = null;
  }
  // Nobody scanned back in time.
  if (state.pending && Date.now() > state.pending.expiresAt) state.pending = null;

  // The partner submits, which completes the connection if we already did.
  if (state.active?.iSubmitted && Date.now() > state.active.partnerSubmitsAt) {
    state.score += 2;
    state.connections += 1;
    save('score', state.score);
    save('connections', state.connections);
    state.active = null;
  }

  return {
    guest_id: 'mock-guest-1',
    reg_no: state.regNo,
    display_name: acct.name,
    state: state.gameState,
    paused: state.paused,
    checked_in: acct.checkedIn,
    opted_in: state.optedInOverride ?? acct.optedIn,
    score: state.score,
    connections_count: state.connections,
    active_connection: state.active && {
      connection_id: state.active.id,
      partner_display_name: state.active.partner,
      starters: pickStarters(),
      min_chat_seconds: minChat(),
      started_at: new Date(state.active.startedAt).toISOString(),
      submit_by: new Date(
        state.active.startedAt + GAME.submitDeadlineSeconds * 1000,
      ).toISOString(),
      i_submitted: state.active.iSubmitted,
    },
    pending_connection: state.pending && {
      connection_id: state.pending.id,
      partner_display_name: state.pending.partner,
      expires_at: new Date(state.pending.expiresAt).toISOString(),
      i_initiated: true,
    },
    server_time: iso(),
  };
}

function minChat(): number {
  return state.gameState === 'COMEBACK'
    ? GAME.minChatSecondsComeback
    : GAME.minChatSecondsGame;
}

export async function qr(): Promise<QrResponse> {
  await delay(100);
  const w = GAME.qrWindowSeconds * 1000;
  const windowIndex = Math.floor(Date.now() / w);
  const endsIn = w - (Date.now() % w);
  return {
    token: `mock.${windowIndex}.${state.regNo || 'anon'}`,
    short_code: String(100000 + (windowIndex % 900000)),
    window_ends_at: iso(endsIn),
    next_token: `mock.${windowIndex + 1}.${state.regNo || 'anon'}`,
    next_starts_at: iso(endsIn),
  };
}

export async function scan(code: string): Promise<ScanResponse> {
  await delay(300);
  const c = code.trim().slice(-6);

  if (!['GAME', 'COMEBACK'].includes(state.gameState)) {
    throw new ApiError('PHASE_CLOSED', 'PHASE_CLOSED');
  }
  if (state.paused) throw new ApiError('PHASE_CLOSED', 'PHASE_CLOSED');
  if (c === '333333') throw new ApiError('ALREADY_CONNECTED', 'ALREADY_CONNECTED');
  if (c === '444444') throw new ApiError('QR_EXPIRED', 'QR_EXPIRED');
  if (c === '555555') throw new ApiError('COOLDOWN', 'COOLDOWN|47', { retryAfterSeconds: 47 });
  if (c === '666666') throw new ApiError('RATE_LIMITED', 'RATE_LIMITED|30', { retryAfterSeconds: 30 });
  if (c !== '111111' && c !== '222222') throw new ApiError('UNKNOWN_CODE', 'UNKNOWN_CODE');
  if (state.active) throw new ApiError('BUSY', 'BUSY');

  const scansBack = c === '111111';
  state.pending = {
    id: `mock-conn-${Date.now()}`,
    partner: scansBack ? 'Ayesha K.' : 'Omar F.',
    expiresAt: Date.now() + GAME.pendingScanTtlSeconds * 1000,
    backAt: scansBack ? Date.now() + 3000 : null,
  };

  return {
    status: 'pending',
    connection_id: state.pending.id,
    partner_display_name: state.pending.partner,
    expires_at: new Date(state.pending.expiresAt).toISOString(),
    i_initiated: true,
  };
}

export async function submit(req: SubmitRequest): Promise<SubmitResponse> {
  await delay(400);
  if (!state.active) throw new ApiError('CONNECTION_EXPIRED', 'CONNECTION_EXPIRED');

  const elapsed = (Date.now() - state.active.startedAt) / 1000;
  if (elapsed < minChat()) {
    const wait = Math.ceil(minChat() - elapsed);
    throw new ApiError('TOO_EARLY', `TOO_EARLY|${wait}`, { waitSeconds: wait });
  }
  const text = req.learned_text.trim();
  if (text.length < GAME.learnedTextMin || text.length > GAME.learnedTextMax) {
    throw new ApiError('INVALID_TEXT', 'INVALID_TEXT');
  }

  state.active.iSubmitted = true;
  return {
    status: 'waiting_partner',
    submit_by: new Date(
      state.active.startedAt + GAME.submitDeadlineSeconds * 1000,
    ).toISOString(),
  };
}

export async function displayStatus(): Promise<DisplayStatus> {
  await delay(120);
  return {
    state: state.gameState,
    paused: state.paused,
    round_ends_at: null,
    server_time: iso(),
  };
}

export async function top10(): Promise<LeaderboardRow[]> {
  await delay(150);
  const rows: [string, number][] = [
    ['Ayesha K.', 18], ['Hamza S.', 17], ['Zara M.', 15], ['Omar F.', 14],
    ['Sana T.', 13], ['Bilal R.', state.score], ['Ali N.', 11], ['Mina J.', 9],
    ['Usman A.', 8], ['Fatima Q.', 7],
  ];
  return rows
    .sort((a, b) => b[1] - a[1])
    .map(([display_name, score], i) => ({ rank: i + 1, display_name, score }));
}

/* ---------------------------------------------------------------- staff */

/** reg_no, full name, display name, checked in, opted in, payment status */
const GUEST_SEED: [string, string, string, boolean, boolean, string][] = [
  ['FA24-BED-001', 'Bilal Rehman',   'Bilal R.',  true,  true,  'Verified'],
  ['FA24-BED-002', 'Hamza Siddiqui', 'Hamza S.',  true,  false, 'Verified'],
  ['FA24-BED-003', 'Ayesha Khan',    'Ayesha K.', true,  true,  'Verified'],
  ['FA24-BED-004', 'Omar Farooq',    'Omar F.',   false, false, 'Verified'],
  ['FA24-BED-005', 'Sana Tariq',     'Sana T.',   true,  true,  'Verified'],
  ['FA24-BED-006', 'Ali Nawaz',      'Ali N.',    false, false, 'Proof submitted'],
  ['FA26-BED-027', 'Hannan Nazir',   'Hannan N.', false, false, 'Proof submitted'],
  ['SP26-ECO-071', 'Ayesha Khan',    'Ayesha K.', false, false, 'Verified'],
  ['FA24-BED-999', 'Zara Mir',       'Zara M.',   false, false, 'Verified'],
];

const GUESTS: StaffGuest[] = GUEST_SEED.map(
  ([reg_no, full_name, display_name, ci, oi, pay]) => ({
    guest_id: `mock-g-${reg_no}`,
    reg_no,
    full_name,
    display_name,
    checked_in_at: ci ? iso(-600_000) : null,
    opted_in_at: oi ? iso(-500_000) : null,
    payment_status: pay,
  }),
);

/** Stable per guest, so the same one always reads out the same password. */
const PASSWORDS: Record<string, string> = Object.fromEntries(
  GUEST_SEED.map(([reg], i) => [reg, ['k7m2qp', 'r4td9w', 'jx2n7c', 'q8vm3z',
    'h5kp2r', 'n9wq4t', 'b3zj7m', 'v6cr8x', 'd2pt5k'][i] ?? 'k7m2qp']),
);

/** Admin-only extras: email, phone, organizer, disqualified, staff role. */
const GUEST_EXTRA: Record<string, {
  email: string; phone: string; organizer: boolean; disqualified: boolean;
  staffRole: 'staff' | 'admin' | null;
}> = Object.fromEntries(
  GUEST_SEED.map(([reg], i) => [reg, {
    email: `${reg.toLowerCase()}@cuilahore.edu.pk`,
    phone: `0300${String(1234567 + i)}`,
    organizer: reg === 'FA24-BED-001',
    disqualified: false,
    // One admin and one existing volunteer, so the panel has something to show.
    staffRole: reg === 'FA24-BED-001' ? 'admin'
             : reg === 'FA24-BED-005' ? 'staff'
             : null,
  }]),
);

export async function staffSearch(q: string): Promise<StaffGuest[]> {
  await delay(180);
  const needle = q.trim().toLowerCase();
  if (!needle) return GUESTS;
  return GUESTS.filter(
    (g) =>
      g.full_name.toLowerCase().includes(needle) ||
      g.reg_no.toLowerCase().includes(needle),
  );
}

export async function checkin(guestId: string): Promise<GuestCredentials> {
  await delay(250);
  const guest = GUESTS.find((g) => g.guest_id === guestId);
  if (!guest) throw new ApiError('UNKNOWN_CODE', 'UNKNOWN_CODE');

  // Payment is not checked here, same as the real function. The volunteer sees
  // payment_status on the card and decides.
  guest.checked_in_at = guest.checked_in_at ?? iso();
  return { reg_no: guest.reg_no, password: PASSWORDS[guest.reg_no] ?? 'k7m2qp' };
}

export async function counters(): Promise<StaffCounters> {
  await delay(120);
  return { checked_in: 143, opted_in: 128, total: 250 };
}

/* ---------------------------------------------------------------- admin */

export async function overview(): Promise<AdminOverview> {
  await delay(160);
  return {
    state: state.gameState,
    paused: state.paused,
    checked_in: 143,
    opted_in: 128,
    connections_completed: 212,
    connections_pending: 9,
    connections_active: 23,
    connections_per_minute: 17,
    open_flags: 3,
  };
}

const PHASE_ORDER: GameState[] = [
  'SETUP', 'CHECKIN', 'GAME', 'COMEBACK', 'LOCKED', 'VERIFIED', 'REVEALED',
];

export async function setState(s: GameState) {
  await delay(200);
  // Mirrors the real set_state: phases go in order, one at a time.
  const from = PHASE_ORDER.indexOf(state.gameState);
  const to = PHASE_ORDER.indexOf(s);
  if (to !== from + 1) {
    throw new ApiError('ILLEGAL_TRANSITION', `ILLEGAL_TRANSITION|${state.gameState} to ${s}`);
  }
  state.gameState = s;
  return { state: s };
}

export async function pause(p: boolean) {
  await delay(150);
  state.paused = p;
  return { paused: p };
}

export async function leaderboardFull(): Promise<AdminLeaderboardRow[]> {
  await delay(220);
  return [
    ['Ayesha K.', 18, 9, 7, 0, false, false],
    ['Hamza S.', 17, 9, 6, 1, false, true],
    ['Zara M.', 15, 8, 5, 0, false, false],
    ['Omar F.', 14, 7, 6, 0, true, false],
    ['Sana T.', 13, 7, 4, 0, false, false],
  ].map(([n, s, c, g, f, org, review], i) => ({
    guest_id: `mock-g-${i}`,
    rank: i + 1,
    display_name: n as string,
    score: s as number,
    connections: c as number,
    great_votes_received: g as number,
    flags_open: f as number,
    is_organizer: org as boolean,
    under_review: review as boolean,
    disqualified: false,
  }));
}

export async function comebackList(): Promise<ComebackRow[]> {
  await delay(200);
  return [
    ['Ali N.', 2, 1], ['Mina J.', 2, 1], ['Usman A.', 1, 1],
    ['Fatima Q.', 1, 1], ['Bilal R.', 0, 0],
  ].map(([display_name, score, connections], i) => ({
    guest_id: `mock-cb-${i}`,
    display_name: display_name as string,
    score: score as number,
    connections: connections as number,
  }));
}

/* ------------------------------------------------- admin guests panel */

function arrivalOf(g: StaffGuest): Arrival {
  if (g.checked_in_at && g.opted_in_at) return 'playing';
  if (g.checked_in_at) return 'checked_in';
  return 'not_arrived';
}

function toAdminRow(g: StaffGuest): AdminGuestRow {
  const extra = GUEST_EXTRA[g.reg_no];
  return {
    guest_id: g.guest_id,
    reg_no: g.reg_no,
    full_name: g.full_name,
    display_name: g.display_name,
    email: extra?.email ?? null,
    phone: extra?.phone ?? null,
    payment_status: g.payment_status,
    checked_in_at: g.checked_in_at,
    opted_in_at: g.opted_in_at,
    is_organizer: extra?.organizer ?? false,
    disqualified: extra?.disqualified ?? false,
    staff_role: extra?.staffRole ?? null,
    arrival: arrivalOf(g),
    score: g.opted_in_at ? 4 + (g.reg_no.charCodeAt(11) % 9) : 0,
    connections: g.opted_in_at ? 2 + (g.reg_no.charCodeAt(11) % 5) : 0,
  };
}

export async function adminGuestList(
  q: string,
  arrival: Arrival | 'all',
): Promise<AdminGuestRow[]> {
  await delay(220);
  const needle = q.trim().toLowerCase();
  return GUESTS
    .map(toAdminRow)
    .filter((r) =>
      !needle ||
      r.full_name.toLowerCase().includes(needle) ||
      r.reg_no.toLowerCase().includes(needle) ||
      (r.email ?? '').toLowerCase().includes(needle))
    .filter((r) => arrival === 'all' || r.arrival === arrival)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function adminGuestCounts(): Promise<AdminGuestCounts> {
  await delay(120);
  const rows = GUESTS.map(toAdminRow);
  return {
    all: rows.length,
    playing: rows.filter((r) => r.arrival === 'playing').length,
    checked_in: rows.filter((r) => r.arrival === 'checked_in').length,
    not_arrived: rows.filter((r) => r.arrival === 'not_arrived').length,
    unpaid: rows.filter((r) => r.payment_status !== 'Verified').length,
    staff: rows.filter((r) => r.staff_role !== null).length,
  };
}

export async function setPaymentStatus(guestId: string, status: string) {
  await delay(200);
  const g = GUESTS.find((x) => x.guest_id === guestId);
  if (g) g.payment_status = status;
  return { ok: true as const };
}

export async function setOrganizer(guestId: string, isOrganizer: boolean) {
  await delay(200);
  const g = GUESTS.find((x) => x.guest_id === guestId);
  if (g && GUEST_EXTRA[g.reg_no]) GUEST_EXTRA[g.reg_no].organizer = isOrganizer;
  return { ok: true as const };
}

export async function setStaffRole(guestId: string, isStaff: boolean) {
  await delay(220);
  const g = GUESTS.find((x) => x.guest_id === guestId);
  if (!g) throw new ApiError('UNKNOWN_CODE', 'UNKNOWN_CODE');
  const extra = GUEST_EXTRA[g.reg_no];
  // Mirrors the real function: the button never touches an admin.
  if (extra?.staffRole === 'admin') throw new ApiError('IS_ADMIN', 'IS_ADMIN');
  if (extra) extra.staffRole = isStaff ? 'staff' : null;
  return { ok: true as const };
}

export async function setDisqualified(guestId: string, disqualified: boolean) {
  await delay(200);
  const g = GUESTS.find((x) => x.guest_id === guestId);
  if (g && GUEST_EXTRA[g.reg_no]) GUEST_EXTRA[g.reg_no].disqualified = disqualified;
  return { ok: true as const };
}

export async function flags(): Promise<Flag[]> {
  await delay(200);
  return [
    {
      id: 'f1', guest_id: 'mock-g-0', guest_display_name: 'Ayesha K.',
      connection_id: 'c-91', code: 'TEXT_SIMILARITY', severity: 'warn',
      details: { similarity: 0.87, across_connections: 4 },
      status: 'open', created_at: iso(-300_000),
    },
    {
      id: 'f2', guest_id: 'mock-g-1', guest_display_name: 'Hamza S.',
      connection_id: null, code: 'CLIQUE', severity: 'high',
      details: { clustering: 0.91, connections: 9 },
      status: 'open', created_at: iso(-120_000),
    },
    {
      id: 'f3', guest_id: 'mock-g-4', guest_display_name: 'Sana T.',
      connection_id: 'c-77', code: 'INSTANT_SUBMIT', severity: 'info',
      details: { seconds_over_minimum: 3, occurrences: 6 },
      status: 'open', created_at: iso(-60_000),
    },
  ];
}
