'use client';

/**
 * ADMIN — Task 2.
 *
 * Game control (state buttons with a confirm dialog, pause/resume), the
 * overview counters, the full leaderboard, and the comeback list.
 *
 * The comeback list is the bottom 25% and is ADMIN ONLY. It never goes on the
 * display screen and never reaches a guest.
 *
 * The server refuses any state transition that skips a state. Show the error
 * rather than trying to prevent it in the UI.
 */

import { Screen } from '@/components/ui';

export default function AdminPage() {
  return (
    <Screen title="Admin">
      {/* TODO Task 2: overview, state control, pause, leaderboard, comeback list */}
      <p className="text-forest/60">Admin dashboard goes here.</p>
    </Screen>
  );
}
