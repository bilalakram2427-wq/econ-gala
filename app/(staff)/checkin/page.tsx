'use client';

/**
 * STAFF CHECK-IN — Task 2.
 *
 * A volunteer searches by name or reg number, checks the guest's ID against
 * the name on screen, and taps Check in. The reg number and password then
 * appear FOR THAT ONE GUEST so the volunteer can read them out.
 *
 * Never render a list of passwords. One guest, on tap, and it disappears when
 * the volunteer moves on. This is used one-handed, standing at a gate, so the
 * search box and the Check in button both need to be big.
 */

import { Screen } from '@/components/ui';

export default function CheckinPage() {
  return (
    <Screen title="Check in">
      {/* TODO Task 2: search, guest card, Check in, credentials reveal, counters */}
      <p className="text-forest/60">Check-in screen goes here.</p>
    </Screen>
  );
}
