/**
 * The only way any screen talks to the server.
 *
 * Calls go straight to Supabase from the browser (PostgREST RPC), not through
 * Next.js API routes: Vercel's free plan meters function invocations and ~250
 * phones polling for an hour is roughly 200k of them. The function names below
 * match the endpoint names in section 12 of the spec, so the contract still reads
 * true even though the transport is different.
 *
 * Rules for everyone:
 *   - No screen imports @supabase/supabase-js. Everything goes through this file.
 *   - Every function either returns typed data or throws an ApiError.
 *   - Catch ApiError, read `.code`, show ERROR_TEXT[code]. Never show a raw code.
 *
 * Owner: Bilal.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { USE_MOCKS, normalizeRegNo } from './config';
import {
  ApiError,
  type AdminLeaderboardRow,
  type AdminOverview,
  type ApiErrorCode,
  type ComebackRow,
  type Flag,
  type GameState,
  type GuestCredentials,
  type LeaderboardRow,
  type MeResponse,
  type QrResponse,
  type ScanResponse,
  type StaffCounters,
  type StaffGuest,
  type SubmitRequest,
  type SubmitResponse,
} from './types';
import * as mocks from './mocks';

/* -------------------------------------------------------------- client */

let client: SupabaseClient | null = null;

/** Not exported on purpose. Screens must not reach the raw client. */
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new ApiError('UNKNOWN', 'Supabase environment variables are missing.');
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let data: unknown;
  let error: { message?: string; details?: string } | null;

  try {
    ({ data, error } = await sb().rpc(fn, args));
  } catch {
    throw new ApiError('NETWORK', 'Request did not reach the server.');
  }

  if (error) throw toApiError(error);
  return data as T;
}

const KNOWN_CODES: ApiErrorCode[] = [
  'UNAUTHENTICATED', 'BAD_CREDENTIALS', 'NOT_CHECKED_IN', 'PHASE_CLOSED',
  'NOT_OPTED_IN', 'DISQUALIFIED', 'UNKNOWN_CODE', 'ALREADY_CONNECTED', 'BUSY',
  'COOLDOWN', 'QR_EXPIRED', 'CONNECTION_EXPIRED', 'INVALID_TEXT', 'TOO_EARLY',
  'RATE_LIMITED',
];

/**
 * Each RPC raises a Postgres exception whose MESSAGE is one of the codes above,
 * optionally followed by a pipe and a number of seconds, e.g. `COOLDOWN|47`.
 */
function toApiError(error: { message?: string }): ApiError {
  const raw = (error.message ?? '').trim().toUpperCase();
  const [codePart, hint] = raw.split('|');
  const code = (KNOWN_CODES as string[]).includes(codePart)
    ? (codePart as ApiErrorCode)
    : 'UNKNOWN';
  const seconds = hint ? Number(hint) : undefined;

  return new ApiError(code, error.message ?? 'Unknown error', {
    retryAfterSeconds:
      code === 'COOLDOWN' || code === 'RATE_LIMITED' ? seconds : undefined,
    waitSeconds: code === 'TOO_EARLY' ? seconds : undefined,
  });
}

/* ---------------------------------------------------------------- auth */

/**
 * Guests have no real email. Supabase Auth needs one, so each guest's reg
 * number becomes a synthetic address. This never leaves the browser or the
 * database and is never shown to anyone.
 */
export function regNoToEmail(regNo: string): string {
  return `${normalizeRegNo(regNo).toLowerCase()}@econgala.local`;
}

export const auth = {
  /**
   * Reg number + password. Succeeds for any guest on the list, checked in or
   * not — the gate is enforced per action by the server, and the app shows the
   * "see you at the gate" screen when me().checked_in is false.
   */
  async login(regNo: string, password: string): Promise<void> {
    if (USE_MOCKS) return mocks.login(normalizeRegNo(regNo), password);
    let error: { message?: string } | null;
    try {
      ({ error } = await sb().auth.signInWithPassword({
        email: regNoToEmail(regNo),
        password,
      }));
    } catch {
      throw new ApiError('NETWORK', 'Request did not reach the server.');
    }
    if (error) throw new ApiError('BAD_CREDENTIALS', error.message ?? 'Login failed');
  },

  async logout(): Promise<void> {
    if (USE_MOCKS) return mocks.logout();
    await sb().auth.signOut();
  },

  /** True if a session exists in this browser. Says nothing about check-in. */
  async isLoggedIn(): Promise<boolean> {
    if (USE_MOCKS) return mocks.isLoggedIn();
    const { data } = await sb().auth.getSession();
    return Boolean(data.session);
  },
};

/* --------------------------------------------------------------- guest */

export const api = {
  /** Accept the consent text and join the game. Requires being checked in. */
  optin: (): Promise<{ ok: true }> =>
    USE_MOCKS ? mocks.optin() : rpc('optin', {}),

  /** Everything the guest app renders. Poll on POLL_MS.guestHome. */
  me: (): Promise<MeResponse> =>
    USE_MOCKS ? mocks.me() : rpc('me', {}),

  /**
   * Current token AND the next window's token. Fetch once per window and cache
   * both, so a brief network drop never blanks the QR.
   */
  qr: (): Promise<QrResponse> =>
    USE_MOCKS ? mocks.qr() : rpc('get_qr', {}),

  /** The scanned token, or the 6-digit code typed by hand. */
  scan: (code: string): Promise<ScanResponse> =>
    USE_MOCKS ? mocks.scan(code) : rpc('scan', { p_code: code }),

  /** Safe to retry with the same idempotency_key. */
  submit: (req: SubmitRequest): Promise<SubmitResponse> =>
    USE_MOCKS
      ? mocks.submit(req)
      : rpc('submit', {
          p_connection_id: req.connection_id,
          p_learned_text: req.learned_text,
          p_vote: req.vote,
          p_idempotency_key: req.idempotency_key,
        }),

  /** Give up on a pending connection the guest started. */
  cancelPending: (connectionId: string): Promise<{ ok: true }> =>
    USE_MOCKS ? mocks.ok() : rpc('cancel_pending', { p_connection_id: connectionId }),

  top10: (): Promise<LeaderboardRow[]> =>
    USE_MOCKS ? mocks.top10() : rpc('top10', {}),
};

/* --------------------------------------------------------------- staff */

export const staffApi = {
  /** Matches on name or reg number. */
  search: (q: string): Promise<StaffGuest[]> =>
    USE_MOCKS ? mocks.staffSearch(q) : rpc('staff_search_guests', { p_q: q }),

  /**
   * Marks the guest checked in and returns their credentials so the volunteer
   * can read them out. Show them for this one guest only.
   */
  checkin: (guestId: string): Promise<GuestCredentials> =>
    USE_MOCKS ? mocks.checkin(guestId) : rpc('checkin', { p_guest_id: guestId }),

  /** Same credentials again for someone who forgot. Does not re-check them in. */
  revealCredentials: (guestId: string): Promise<GuestCredentials> =>
    USE_MOCKS
      ? mocks.checkin(guestId)
      : rpc('reveal_credentials', { p_guest_id: guestId }),

  counters: (): Promise<StaffCounters> =>
    USE_MOCKS ? mocks.counters() : rpc('staff_counters', {}),
};

/* --------------------------------------------------------------- admin */

export const adminApi = {
  overview: (): Promise<AdminOverview> =>
    USE_MOCKS ? mocks.overview() : rpc('admin_overview', {}),

  /** The server refuses any transition that skips a state. */
  setState: (state: GameState): Promise<{ state: GameState }> =>
    USE_MOCKS ? mocks.setState(state) : rpc('set_state', { p_state: state }),

  pause: (paused: boolean): Promise<{ paused: boolean }> =>
    USE_MOCKS ? mocks.pause(paused) : rpc('pause', { p_paused: paused }),

  leaderboardFull: (): Promise<AdminLeaderboardRow[]> =>
    USE_MOCKS ? mocks.leaderboardFull() : rpc('admin_leaderboard_full', {}),

  /** Bottom 25% from the COMEBACK snapshot. Admin eyes only. */
  comebackList: (): Promise<ComebackRow[]> =>
    USE_MOCKS ? mocks.comebackList() : rpc('admin_comeback_list', {}),

  flags: (status: 'open' | 'cleared' | 'confirmed' = 'open'): Promise<Flag[]> =>
    USE_MOCKS ? mocks.flags() : rpc('admin_flags', { p_status: status }),

  resolveFlag: (flagId: string, action: 'clear' | 'confirm'): Promise<{ ok: true }> =>
    USE_MOCKS ? mocks.ok() : rpc('resolve_flag', { p_flag_id: flagId, p_action: action }),

  voidConnection: (connectionId: string, reason: string): Promise<{ ok: true }> =>
    USE_MOCKS
      ? mocks.ok()
      : rpc('void_connection', { p_connection_id: connectionId, p_reason: reason }),
};

/* ------------------------------------------------------------ polling */

/**
 * Call `fetcher` every `intervalMs` and hand each result to `onData`.
 * Returns a stop function — call it in your effect's cleanup.
 *
 * Network blips are swallowed and retried silently, because the park wifi will
 * drop and a guest should not see an error for a missed poll. Every other
 * ApiError goes to `onError` so the screen can show ERROR_TEXT.
 *
 * Use this instead of your own setInterval, so all four surfaces behave the
 * same way when the network goes bad.
 *
 *   useEffect(() => poll(api.me, POLL_MS.guestHome, setMe, setErr), []);
 */
export function poll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  onData: (data: T) => void,
  onError?: (err: ApiError) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  const tick = async () => {
    if (stopped) return;
    try {
      const data = await fetcher();
      if (!stopped) onData(data);
    } catch (err) {
      if (!stopped && err instanceof ApiError && err.code !== 'NETWORK') {
        onError?.(err);
      }
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
