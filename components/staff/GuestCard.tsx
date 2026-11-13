'use client';

/**
 * One guest in the check-in search results.
 *
 * Shows the name, reg number and payment status, and either a Check in button
 * or a tick if they are already in. This component never sees a password:
 * credentials are shown by the page, for one guest at a time.
 */

import { Button, Card } from '@/components/ui';
import { karachiTime } from '@/lib/time';
import type { StaffGuest } from '@/lib/types';

interface Props {
  guest: StaffGuest;
  /** True while a request for THIS guest is in flight. */
  busy: boolean;
  /** True while ANY check-in request is in flight, so two taps cannot overlap. */
  locked: boolean;
  onCheckin: (guest: StaffGuest) => void;
  /** For someone who forgot their login. Does not check them in a second time. */
  onReveal: (guest: StaffGuest) => void;
}

export function GuestCard({ guest, busy, locked, onCheckin, onReveal }: Props) {
  const checkedInAt = guest.checked_in_at;
  const status = guest.payment_status ?? 'no payment record';
  const unpaid =
    !guest.payment_status || guest.payment_status.toLowerCase() === 'unpaid';

  return (
    <Card className="space-y-3">
      <div>
        <div className="font-heading text-2xl leading-tight">{guest.full_name}</div>
        <div className="text-base text-forest/70">
          {guest.reg_no} ·{' '}
          <span className={unpaid ? 'font-medium text-red-800' : ''}>{status}</span>
        </div>
      </div>

      {checkedInAt ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-medium text-emerald-800">
            ✓ In at {karachiTime(checkedInAt)}
          </span>
          <Button
            variant="secondary"
            busy={busy}
            disabled={locked}
            onClick={() => onReveal(guest)}
          >
            Show login
          </Button>
        </div>
      ) : (
        <Button full busy={busy} disabled={locked} onClick={() => onCheckin(guest)}>
          Check in
        </Button>
      )}
    </Card>
  );
}
