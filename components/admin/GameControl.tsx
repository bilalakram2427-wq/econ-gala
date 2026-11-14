'use client';

/**
 * Phase buttons and pause/resume.
 *
 * Every change opens a confirmation dialog that says what it will do. The
 * server decides what is allowed: it refuses any jump that skips a state, and
 * we show that refusal as a sentence rather than trying to block it here.
 */

import { useState } from 'react';
import { Banner, Button, Card } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { ApiError, type GameState } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { describeAdminError } from './describeError';

const STATES: GameState[] = [
  'SETUP',
  'CHECKIN',
  'GAME',
  'COMEBACK',
  'LOCKED',
  'VERIFIED',
  'REVEALED',
];

/** What each phase does, in words, for the confirmation dialog. */
const WHAT_IT_DOES: Record<GameState, string> = {
  SETUP: 'Guests cannot scan or submit. Use this while you prepare.',
  CHECKIN: 'The gate opens. Guests can be checked in, but they cannot play yet.',
  GAME: 'Scanning and submitting open for everyone who is checked in and has joined.',
  COMEBACK:
    'This takes the snapshot of the bottom 25% and cannot be undone. Waiting times between conversations get shorter for everyone.',
  LOCKED:
    'This ends the game. Unfinished conversations expire and scores freeze. This cannot be undone.',
  VERIFIED: 'Use this only after two admins have checked the top scores.',
  REVEALED: 'Use this when the awards are announced.',
};

const CANNOT_UNDO: GameState[] = ['COMEBACK', 'LOCKED'];

type Pending =
  | { kind: 'state'; state: GameState }
  | { kind: 'pause'; paused: boolean };

export function GameControl({
  state,
  paused,
  onChanged,
}: {
  state: GameState;
  paused: boolean;
  /** Called after the server accepts a change, so the page can refresh now. */
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (pending.kind === 'state') await adminApi.setState(pending.state);
      else await adminApi.pause(pending.paused);
      setPending(null);
      onChanged();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', '');
      setMessage(describeAdminError(err));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const dialog =
    pending === null
      ? null
      : pending.kind === 'state'
        ? {
            title: `Set ${pending.state}?`,
            body: WHAT_IT_DOES[pending.state],
            confirm: `Set ${pending.state}`,
            danger: CANNOT_UNDO.includes(pending.state),
          }
        : pending.paused
          ? {
              title: 'Pause the game?',
              body: 'Timers freeze and new scans are refused until you resume.',
              confirm: 'Pause',
              danger: false,
            }
          : {
              title: 'Resume the game?',
              body: 'Timers and scanning start again.',
              confirm: 'Resume',
              danger: false,
            };

  const canPause = state === 'GAME' || state === 'COMEBACK';

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-forest/60">Phase</div>
          <div className="font-heading text-3xl">
            {state}
            {paused ? <span className="ml-3 text-amber-800">· paused</span> : null}
          </div>
        </div>

        {canPause || paused ? (
          <Button
            variant={paused ? 'primary' : 'secondary'}
            onClick={() => setPending({ kind: 'pause', paused: !paused })}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
      </div>

      {message ? <Banner tone="error">{message}</Banner> : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Set the phase">
        {STATES.map((s) => (
          <Button
            key={s}
            variant={s === state ? 'primary' : 'secondary'}
            aria-pressed={s === state}
            onClick={() => {
              if (s !== state) setPending({ kind: 'state', state: s });
            }}
          >
            {s === state ? `✓ ${s}` : s}
          </Button>
        ))}
      </div>

      {dialog ? (
        <ConfirmDialog
          title={dialog.title}
          confirmLabel={dialog.confirm}
          danger={dialog.danger}
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          {dialog.body}
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}
