'use client';

/**
 * SCAN — Task 1.
 *
 * Camera view that reads a partner's QR and calls api.scan(code).
 * Must also offer manual entry of the 6-digit code, and explain what to do
 * when the camera is blocked. Use html5-qrcode (already in package.json);
 * try window.BarcodeDetector first if it exists, since it is much faster.
 */

import { Screen } from '@/components/ui';

export default function ScanPage() {
  return (
    <Screen title="Scan">
      {/* TODO Task 1: camera, torch toggle, manual code entry, camera-denied help */}
      <p className="text-forest/60">Scanner goes here.</p>
    </Screen>
  );
}
