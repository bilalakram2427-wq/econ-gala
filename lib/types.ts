/**
 * Shared types for the Econ Gala Networking Game.
 *
 * Source of truth: Technical Specification v1.0 (sections 10 and 12), as amended
 * by the team decisions in docs/DECISIONS.md:
 *   - Login is reg# + password, not a one-time claim link.
 *   - Logging in and being allowed to play are separate. Check-in opens play.
 *   - No missions, no wheel, no dare tracking. COMEBACK is a pacing phase only.
 *   - The server returns three conversation starters per connection, not one.
 *
 * Owner: Bilal. If you need a shape that isn't here, ask in the group and it
 * gets added once, for everyone.
 */

/* ---------------------------------------------------------------- enums */

export type GameState =
  | 'SETUP'
  | 'CHECKIN'
  | 'GAME'
  | 'COMEBACK'
  | 'LOCKED'
  | 'VERIFIED'
  | 'REVEALED';

export type ConnStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'expired'
  | 'voided';

export type Vote = 'great' | 'skip';

/** Phases in which scanning and submitting are accepted. */
export const PLAYABLE_STATES: GameState[] = ['GAME', 'COMEBACK'];

/* -------------------------------------------------------- connections */

export interface ActiveConnection {
  connection_id: string;
  partner_display_name: string;
  /** Three prompts. The pair picks whichever they like; the server chose them. */
  starters: string[];
  min_chat_seconds: number;
  started_at: string; // ISO
  submit_by: string; // ISO
  i_submitted: boolean;
}

export interface PendingConnection {
  connection_id: string;
  partner_display_name: string;
  expires_at: string; // ISO
  i_initiated: boolean;
}

/* ------------------------------------------------------------- guest me */

/** GET /api/me — the single source of truth for what the guest app renders. */
export interface MeResponse {
  guest_id: string;
  reg_no: string;
  display_name: string;

  /** Phase of the game. */
  state: GameState;
  paused: boolean;

  /**
   * The check-in gate. A guest can log in at any time, but until a volunteer
   * has checked them in, `checked_in` is false and every action is refused.
   * Show the "see you at the gate" screen in that case.
   */
  checked_in: boolean;
  /** They have accepted the consent text and joined the game. */
  opted_in: boolean;

  score: number;
  connections_count: number;

  active_connection: ActiveConnection | null;
  pending_connection: PendingConnection | null;

  /** Server clock. Use this for every countdown; never the phone clock. */
  server_time: string; // ISO
}

/* ------------------------------------------------------------------ qr */

/** GET /api/qr */
export interface QrResponse {
  token: string;
  short_code: string; // 6 digits
  window_ends_at: string; // ISO
  next_token: string;
  next_starts_at: string; // ISO
}

/* ---------------------------------------------------------------- scan */

export type ScanResponse =
  | ({ status: 'pending' } & PendingConnection)
  | ({ status: 'active' } & ActiveConnection);

/* -------------------------------------------------------------- submit */

export interface SubmitRequest {
  connection_id: string;
  learned_text: string; // 15..140 chars after trim
  vote: Vote;
  /** uuid. Generate once per attempt and reuse it on every retry. */
  idempotency_key: string;
}

export type SubmitResponse =
  | { status: 'waiting_partner'; submit_by: string }
  | { status: 'completed'; points_awarded: number; new_total: number };

/* --------------------------------------------------------- leaderboard */

export interface LeaderboardRow {
  rank: number;
  display_name: string;
  score: number;
}

/* --------------------------------------------------------------- staff */

export interface StaffGuest {
  guest_id: string;
  reg_no: string;
  full_name: string;
  display_name: string;
  checked_in_at: string | null;
  opted_in_at: string | null;
  payment_status: string | null;
}

/**
 * Returned only by checkin() and revealCredentials(), and only for one guest
 * at a time. Never render a list of these.
 */
export interface GuestCredentials {
  reg_no: string;
  password: string;
}

export interface StaffCounters {
  checked_in: number;
  opted_in: number;
  total: number;
}

/* --------------------------------------------------------------- admin */

export interface AdminOverview {
  state: GameState;
  paused: boolean;
  checked_in: number;
  opted_in: number;
  connections_completed: number;
  connections_pending: number;
  connections_active: number;
  connections_per_minute: number;
  open_flags: number;
}

export type FlagCode =
  | 'DEVICE_SHARED'
  | 'INSTANT_SUBMIT'
  | 'TEXT_SIMILARITY'
  | 'CLIQUE'
  | 'MUTUAL_GREAT_100'
  | 'BURST'
  | 'MANUAL_ENTRY';

export interface Flag {
  id: string;
  guest_id: string;
  guest_display_name: string;
  connection_id: string | null;
  code: FlagCode;
  severity: 'info' | 'warn' | 'high';
  details: Record<string, unknown>;
  status: 'open' | 'cleared' | 'confirmed';
  created_at: string;
}

export interface AdminLeaderboardRow extends LeaderboardRow {
  guest_id: string;
  connections: number;
  great_votes_received: number;
  flags_open: number;
  is_organizer: boolean;
  under_review: boolean;
  disqualified: boolean;
}

/**
 * The bottom 25% at the COMEBACK snapshot. Admin eyes only — this list is never
 * returned to a guest and never shown on the display.
 */
export interface ComebackRow {
  guest_id: string;
  display_name: string;
  score: number;
  connections: number;
}

/* --------------------------------------------------------------- error */

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'BAD_CREDENTIALS'
  | 'NOT_CHECKED_IN'
  | 'PHASE_CLOSED'
  | 'NOT_OPTED_IN'
  | 'DISQUALIFIED'
  | 'UNKNOWN_CODE'
  | 'ALREADY_CONNECTED'
  | 'BUSY'
  | 'COOLDOWN'
  | 'QR_EXPIRED'
  | 'CONNECTION_EXPIRED'
  | 'INVALID_TEXT'
  | 'TOO_EARLY'
  | 'RATE_LIMITED'
  | 'NETWORK' // client-side only: the request never reached the server
  | 'UNKNOWN';

export class ApiError extends Error {
  code: ApiErrorCode;
  retryAfterSeconds?: number;
  waitSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    extra?: { retryAfterSeconds?: number; waitSeconds?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
    this.waitSeconds = extra?.waitSeconds;
  }
}

/**
 * Friendly text for every error code. Screens show these, never a raw code.
 * Reword freely, but keep one entry per code so nothing falls through.
 */
export const ERROR_TEXT: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Your session ended. Log in again with your reg number.',
  BAD_CREDENTIALS: 'That reg number and password do not match. Check with a volunteer.',
  NOT_CHECKED_IN: 'You are not checked in yet. See you at the gate.',
  PHASE_CLOSED: 'The game is not running right now.',
  NOT_OPTED_IN: 'Tap Join the game first.',
  DISQUALIFIED: 'Your account cannot score. Please find an organizer.',
  UNKNOWN_CODE: 'That code is not valid. Try scanning again.',
  ALREADY_CONNECTED: 'You have already connected with this person.',
  BUSY: 'Finish your current conversation first.',
  COOLDOWN: 'Take a breath before the next one.',
  QR_EXPIRED: 'That code expired. Ask them to show it again.',
  CONNECTION_EXPIRED: 'This connection timed out. You can both try again.',
  INVALID_TEXT: 'Write between 15 and 140 characters about them.',
  TOO_EARLY: 'Keep talking a little longer.',
  RATE_LIMITED: 'Slow down a moment, then try again.',
  NETWORK: 'No connection. We will keep trying.',
  UNKNOWN: 'Something went wrong. Try again.',
};
