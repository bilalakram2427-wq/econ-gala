
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';

import {
  Banner,
  Button,
  Card,
  CenteredNote,
  ErrorNote,
  Loading,
  Screen,
  Stat,
} from '@/components/ui';

import { useMe } from '@/lib/useMe';
import { api, poll } from '@/lib/api';
import { POLL_MS } from '@/lib/config';
import { secondsUntil } from '@/lib/time';
import type { QrResponse } from '@/lib/types';

export default function GuestHome() {
  const { me, error, loading, refresh } = useMe();
  const router = useRouter();

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [qr, setQr] = useState<QrResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const stopPolling = poll(
      api.qr,
      POLL_MS.guestHome,
      (data) => setQr(data),
    );

    return stopPolling;
  }, []);

  useEffect(() => {
    if (!qr) return;

    const updateCountdown = () => {
      setSecondsLeft(secondsUntil(qr.window_ends_at));
    };

    updateCountdown();

    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [qr]);

  if (loading) return <Loading />;

  if (error?.code === 'UNAUTHENTICATED') {
    return (
      <CenteredNote heading="Log in to play">
        <Link className="text-bronze underline" href="/login">
          Go to login
        </Link>
      </CenteredNote>
    );
  }

  if (!me) {
    return (
      <Screen>
        <ErrorNote error={error} />
      </Screen>
    );
  }

  if (!me.checked_in) {
    return (
      <CenteredNote heading="See you at the gate">
        A volunteer will check you in when you arrive.
        The game opens on your phone as soon as they do.
      </CenteredNote>
    );
  }

  if (!me.opted_in) {
    async function handleJoin() {
      setJoining(true);
      setJoinError('');

      try {
        await api.optin();
        refresh();
      } catch {
        setJoinError("Couldn't join right now. Please try again.");
      } finally {
        setJoining(false);
      }
    }

    return (
      <CenteredNote heading="Join the game">
        <p className="mb-4">
          I agree to participate in the Econ Gala networking game.
        </p>

        {joinError && (
          <p className="mb-3 text-sm text-red-600">
            {joinError}
          </p>
        )}

        <Button full busy={joining} onClick={handleJoin}>
          Join the game
        </Button>
      </CenteredNote>
    );
  }

  const playable = me.state === 'GAME' || me.state === 'COMEBACK';

  return (
    <Screen title={me.display_name}>
      {me.paused && (
        <Banner tone="warn">
          The game is paused. Hold on a moment.
        </Banner>
      )}

      {!playable && (
        <Banner tone="info">
          {me.state === 'CHECKIN'
            ? 'The game has not started yet.'
            : 'The game is closed. Scores are final.'}
        </Banner>
      )}

      <ErrorNote error={error} />

      {me.pending_connection && !me.pending_connection.i_initiated && (
        <Card className="space-y-3 border border-bronze/30">
          <div>
            <h2 className="font-heading text-xl text-forest">
              Someone wants to connect!
            </h2>

            <p className="text-forest/70">
              {me.pending_connection.partner_display_name} has scanned your QR code.
            </p>

            <p className="text-sm text-forest/60">
              Scan their QR code back to confirm your connection.
            </p>
          </div>

          <Button full onClick={() => router.push('/scan')}>
            Scan their code
          </Button>
        </Card>
      )}

      <Card className="flex flex-col items-center gap-4 p-5">
        <h2 className="font-heading text-xl text-forest">
          Your personal QR code
        </h2>

        {qr ? (
          <>
            <div className="rounded-xl bg-white p-4">
              <QRCode
                value={qr.token}
                size={220}
                level="M"
              />
            </div>

            <p className="text-sm text-forest/60">
              Scan this code to connect with someone
            </p>

            <p className="text-3xl font-semibold tracking-[0.3em] text-forest">
              {qr.short_code}
            </p>

            <p className="text-sm text-bronze">
              QR refreshes in {secondsLeft}s
            </p>
          </>
        ) : (
          <p className="py-12 text-center text-forest/60">
            Loading your QR code...
          </p>
        )}
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Points" value={me.score} />
          <Stat label="People met" value={me.connections_count} />
        </div>
      </Card>

      <Button
        full
        disabled={!playable || me.paused}
        onClick={() => router.push('/scan')}
      >
        Scan someone
      </Button>

      <Link
        href="/top"
        className="block text-center text-sm text-bronze underline underline-offset-4"
      >
        See the top 10
      </Link>
    </Screen>
  );
}
