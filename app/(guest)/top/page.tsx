'use client';

/**
 * TOP 10 — Task 1. Read-only.
 *
 * Never show a guest their own rank unless they are in the top 10, never show
 * anyone else's score outside this list, and never show a bottom list.
 */

import { Screen } from '@/components/ui';

export default function TopPage() {
  return (
    <Screen title="Top 10">
      {/* TODO Task 1: poll api.top10() and render the rows */}
      <p className="text-forest/60">Leaderboard goes here.</p>
    </Screen>
  );
}
