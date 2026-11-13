'use client';

/**
 * A confirmation box. Nothing happens until the admin presses the confirm
 * button. Cancel is focused by default, so a stray Enter key cannot confirm,
 * and Escape closes it.
 */

import { useEffect, type ReactNode } from 'react';
import { Button, Card } from '@/components/ui';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Use for steps that cannot be undone. */
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-forest/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Card className="w-full max-w-md space-y-4 !bg-ivory">
        <h2 className="font-heading text-2xl">{title}</h2>
        <div className="text-forest/80">{children}</div>
        <div className="flex gap-3">
          <Button variant="secondary" full autoFocus disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            full
            busy={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
