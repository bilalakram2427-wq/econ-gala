'use client';

/**
 * BIG SCREEN — Task 2.
 *
 * Projected outdoors at dusk and left alone for over an hour. Ivory on forest,
 * no scrollbars, no cursor, no interaction. Shows the top 10 only.
 *
 * It must heal itself. If the wifi drops or the laptop sleeps:
 *   - the last good standings stay on screen (never a blank page or an error),
 *   - a small "Reconnecting…" note appears after 20 seconds without fresh data,
 *   - polling restarts by itself when the network comes back, when the tab
 *     becomes visible again, and every 30 seconds while data is stale (a
 *     request that hung during sleep can never time out on its own).
 *
 * The display polls instead of using realtime. The guide allows either, and an
 * 8-second lag on a leaderboard is not noticeable. All data comes from lib/api.
 */

import { useEffect, useRef, useState } from 'react';
import { Countdown } from '@/components/ui';
import { adminApi, api, poll } from '@/lib/api';
import { GAME, POLL_MS } from '@/lib/config';
import type { GameState, LeaderboardRow } from '@/lib/types';

/**
 * End of the main round, 6:30 PM Karachi on gala day. This only draws the
 * countdown in the corner. The server decides when the game really ends.
 */
const GAME_ENDS_AT = '2026-11-19T18:30:00+05:00';

/** No fresh data for this long -> show the reconnecting note. */
const STALE_AFTER_MS = 20_000;
/** While stale, restart polling this often in case a request is stuck. */
const KICK_EVERY_MS = 30_000;

/** What the big screen calls each phase. COMEBACK looks like GAME on purpose:
 *  the comeback round is announced by the host, not by this screen. */
const PHASE_LABEL: Record<GameState, string> = {
  SETUP: 'GETTING READY',
  CHECKIN: 'CHECK-IN',
  GAME: 'GAME',
  COMEBACK: 'GAME',
  LOCKED: 'FINAL SCORES',
  VERIFIED: 'FINAL SCORES',
  REVEALED: 'WINNERS',
};

export default function DisplayPage() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [status, setStatus] = useState<{ state: GameState; paused: boolean } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // Changing this restarts both polls straight away.
  const [restartKey, setRestartKey] = useState(0);

  const lastOkRef = useRef<number>(Date.now());
  const lastKickRef = useRef<number>(Date.now());

  /* ---------------------------------------------------------- the polls */

  useEffect(
    () =>
      poll(
        api.top10,
        POLL_MS.realtimeFallback,
        (data) => {
          setRows(data);
          lastOkRef.current = Date.now();
        },
        () => {
          /* keep whatever is on screen; the stale timer shows the note */
        },
      ),
    [restartKey],
  );

  // The phase and pause flag. If this one fails the corner just stays as it was.
  useEffect(
    () =>
      poll(
        adminApi.overview,
        POLL_MS.realtimeFallback,
        (d) => setStatus({ state: d.state, paused: d.paused }),
        () => {},
      ),
    [restartKey],
  );

  /* ----------------------------------------------------- self-healing */

  useEffect(() => {
    const kick = () => {
      lastKickRef.current = Date.now();
      setRestartKey((k) => k + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };

    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);

    // Once a second: decide whether to show the note, and nudge polling if stuck.
    const id = setInterval(() => {
      const age = Date.now() - lastOkRef.current;
      const stale = age > STALE_AFTER_MS;
      setReconnecting(stale);
      if (stale && Date.now() - lastKickRef.current > KICK_EVERY_MS) kick();
    }, 1000);

    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, []);

  /* -------------------------------------------------------------- render */

  const top = (rows ?? []).slice(0, GAME.leaderboardTopN);
  const showCountdown =
    status !== null &&
    !status.paused &&
    (status.state === 'GAME' || status.state === 'COMEBACK');

  return (
    <div className="fixed inset-0 grid cursor-none select-none grid-rows-[auto_1fr] overflow-hidden bg-forest px-[4vw] py-[3vh] text-ivory">
      {/* Corner: title on the left, phase and countdown on the right. */}
      <header className="flex items-baseline justify-between">
        <h1
          className="font-heading font-semibold tracking-[0.2em]"
          style={{ fontSize: 'clamp(1.5rem, 5vh, 5rem)' }}
        >
          ECON GALA
        </h1>
        <div
          className="font-body font-medium tracking-widest text-ivory/80"
          style={{ fontSize: 'clamp(1rem, 3.2vh, 3rem)' }}
        >
          {status ? (status.paused ? 'PAUSED' : PHASE_LABEL[status.state]) : ''}
          {showCountdown ? (
            <>
              {' · '}
              <Countdown to={GAME_ENDS_AT} />
            </>
          ) : null}
        </div>
      </header>

      {/* The top 10. */}
      <main className="flex min-h-0 flex-col justify-evenly">
        {rows === null ? (
          <p
            className="text-center text-ivory/70"
            style={{ fontSize: 'clamp(1.25rem, 4vh, 4rem)' }}
          >
            Loading…
          </p>
        ) : top.length === 0 ? (
          <p
            className="text-center text-ivory/80"
            style={{ fontSize: 'clamp(1.5rem, 5vh, 5rem)' }}
          >
            Waiting for the first connections…
          </p>
        ) : (
          top.map((r) => (
            <div
              key={`${r.rank}-${r.display_name}`}
              className="flex items-baseline"
              style={{ fontSize: 'clamp(1.5rem, 5.2vh, 6rem)', lineHeight: 1.1 }}
            >
              <span className="w-[2.2em] text-right font-semibold text-ivory/70">
                {r.rank}
              </span>
              <span className="ml-[0.8em] font-medium">{r.display_name}</span>
              <span className="mx-[0.6em] flex-1 border-b-2 border-dotted border-ivory/30" />
              <span className="font-semibold tabular-nums">{r.score}</span>
            </div>
          ))
        )}
      </main>

      {/* Only appears when data is stale. Fixed position, so nothing jumps. */}
      {reconnecting ? (
        <div
          role="status"
          className="fixed bottom-[2vh] right-[3vw] text-ivory/70"
          style={{ fontSize: 'clamp(0.9rem, 2.2vh, 2rem)' }}
        >
          Reconnecting…
        </div>
      ) : null}
    </div>
  );
}
