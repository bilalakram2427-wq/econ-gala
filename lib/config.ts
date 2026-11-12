/**
 * Client-side constants.
 *
 * IMPORTANT: these are for drawing countdowns and laying out screens. The
 * server keeps its own copy in the `config` table and that copy decides
 * everything. Never use a value here to allow or block an action — send the
 * request and let the server answer.
 */

/** Mirrors of the server config table. Display hints, not rules. */
export const GAME = {
  qrWindowSeconds: 30,
  pendingScanTtlSeconds: 90,
  minChatSecondsGame: 120,
  minChatSecondsComeback: 60,
  cooldownSecondsGame: 180,
  cooldownSecondsComeback: 120,
  submitDeadlineSeconds: 600,
  learnedTextMin: 15,
  learnedTextMax: 140,
  leaderboardTopN: 10,
} as const;

/**
 * How often each surface asks the server for fresh data.
 *
 * Guest phones poll. Only the display and admin pages use realtime, because the
 * Supabase free plan allows 200 concurrent realtime connections and we expect
 * about 250 guests. A 5-second poll is fine for the scan handshake: the pending
 * connection lives for 90 seconds and the two people are standing in front of
 * each other. Do not "fix" this by adding realtime to the guest app.
 */
export const POLL_MS = {
  /** Home: score, phase, and "someone scanned you" notifications. */
  guestHome: 5000,
  /** Conversation: has my partner submitted yet. */
  guestConversation: 4000,
  /** Waiting for a partner to scan back. */
  guestPending: 3000,
  /** Staff counters. */
  staff: 10000,
  /** Fallback for display and admin when the realtime channel drops. */
  realtimeFallback: 8000,
} as const;

/** Brand, spec section 15. Mirrored in tailwind.config.ts and globals.css. */
export const BRAND = {
  ivory: '#F3EEE5',
  bronze: '#7A5C2E',
  deepGreen: '#14201B',
  /** Outdoors, at dusk, at full brightness. Do not go below this. */
  minTapTargetPx: 48,
} as const;

export const EVENT = {
  name: 'Econ Gala',
  society: 'Econ Ascent',
  timezone: 'Asia/Karachi',
  date: '2026-11-19',
} as const;

/**
 * Reg numbers look like FA24-BED-001 or SP26-ECO-071, but the exact shape
 * varies by intake and department, so we do NOT enforce a pattern. Whatever is
 * in the guest list CSV is correct by definition.
 *
 * `normalizeRegNo` is all the client does: trim, uppercase, collapse spaces.
 * Use it before sending a login, so someone typing in lowercase on a phone
 * keyboard still gets in. Whether the account exists is the server's call.
 */
export function normalizeRegNo(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** Loose sanity check for the login form: is this even worth sending? */
export function looksLikeRegNo(input: string): boolean {
  const s = normalizeRegNo(input);
  return s.length >= 6 && /^[A-Z0-9-]+$/.test(s);
}

/**
 * Run every screen against the fake backend in lib/mocks.ts.
 * Put NEXT_PUBLIC_USE_MOCKS=true in .env.local while the database is being built.
 */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
