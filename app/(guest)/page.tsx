'use client';

/**
 * GUEST HOME — Task 1.
 *
 * This file is a WORKING EXAMPLE, not a finished screen. It shows the pattern
 * every guest screen follows: useMe() for state, the gate checks in order,
 * ErrorNote for failures, Screen for layout. Copy the shape, then build the
 * real thing on top of it.
 *
 * Still to build here (see docs/TASK-1.md):
 *   - the rotating QR, its 30s ring, and the 6-digit code underneath
 *   - the next_token cache so a network drop does not blank the QR
 *   - the pending-connection notification when someone scans you
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banner, Button, Card, CenteredNote, ErrorNote, Loading, Screen, Stat } from '@/components/ui';
import { useMe } from '@/lib/useMe';

export default function GuestHome() {
  const { me, error, loading } = useMe();
  const router = useRouter();

  if (loading) return <Loading />;

  // Not logged in at all.
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

  // The check-in gate. Logging in is not permission to play.
  if (!me.checked_in) {
    return (
      <CenteredNote heading="See you at the gate">
        A volunteer will check you in when you arrive. The game opens on your
        phone as soon as they do.
      </CenteredNote>
    );
  }

  // Checked in but has not accepted the consent text yet.
  if (!me.opted_in) {
    return (
      <CenteredNote heading="Join the game">
        {/* TODO Task 1: consent text and the Join button that calls api.optin() */}
        <Link className="text-bronze underline" href="/login">
          Continue
        </Link>
      </CenteredNote>
    );
  }

  const playable = me.state === 'GAME' || me.state === 'COMEBACK';

  return (
    <Screen title={me.display_name}>
      {me.paused ? (
        <Banner tone="warn">The game is paused. Hold on a moment.</Banner>
      ) : null}

      {!playable ? (
        <Banner tone="info">
          {me.state === 'CHECKIN'
            ? 'The game has not started yet.'
            : 'The game is closed. Scores are final.'}
        </Banner>
      ) : null}

      <ErrorNote error={error} />

      {/* TODO Task 1: the rotating QR goes here. */}
      <Card className="aspect-square grid place-items-center text-forest/40">
        QR code goes here
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
