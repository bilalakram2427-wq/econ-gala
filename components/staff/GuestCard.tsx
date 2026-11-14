'use client';

/**
 * One guest in the check-in search results.
 *
 * Shows the name, reg number and payment status, and either a Check in button
 * or a tick if they are already in. This component never sees a password:
 * credentials are shown by the page, for one guest at a time.
 *
 * PAYMENT STATUS: only "Verified" looks calm. Anything else (for example
 * "Proof submitted", or no record at all) gets a loud red badge, a red outline
 * on the whole card and a "Send to finance" line, because the volunteer reads
 * that with a queue in front of them and sends those people to the finance
 * desk. Do not soften this.
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
  const status = guest.payment_status?.trim() || null;
  const verified = status?.toLowerCase() === 'verified';

  return (
    <Card className={['space-y-3', verified ? '' : 'ring-2 ring-red-600'].join(' ')}>
      <div>
        <div className="font-heading text-2xl leading-tight">{guest.full_name}</div>
        <div className="text-base text-forest/70">{guest.reg_no}</div>
      </div>

      {verified ? (
        <div className="text-base font-medium text-emerald-800">Verified</div>
      ) : (
        <div className="space-y-1">
          <span className="inline-block rounded-lg bg-red-700 px-3 py-1 text-lg font-bold uppercase tracking-wide text-white">
            ⚠ {status ?? 'No payment record'}
          </span>
          <div className="text-base font-bold text-red-800">Send to finance</div>
        </div>
      )}

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
