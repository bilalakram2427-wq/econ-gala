'use client';

/**
 * CONVERSATION — Task 1. The heart of the game.
 *
 * Shows the partner's name, three conversation starters, and a countdown to
 * the minimum chat time. Submit stays disabled until BOTH the timer has run
 * out AND the text is 15-140 characters. After submitting, show the
 * waiting-for-partner state until me().active_connection clears, then the result.
 *
 * Generate the idempotency key ONCE with crypto.randomUUID() when the screen
 * mounts and reuse it on every retry. A fresh key on retry can double-submit.
 */

import { Screen } from '@/components/ui';

export default function ConversationPage() {
  return (
    <Screen title="Conversation">
      {/* TODO Task 1: starters, countdown, text input + counter, Great/Skip, waiting, result */}
      <p className="text-forest/60">Conversation screen goes here.</p>
    </Screen>
  );
}
