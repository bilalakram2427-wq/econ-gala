'use client';

/**
 * BIG SCREEN — Task 2.
 *
 * Runs unattended on a laptop plugged into a projector for over an hour.
 * Dark theme, very large type, readable at dusk from across a lawn.
 *
 * It must recover on its own: if the network drops or the laptop sleeps, it
 * reconnects and keeps going with nobody touching it. Test that by turning
 * the wifi off and on again.
 */

export default function DisplayPage() {
  return (
    <div className="min-h-dvh bg-forest text-ivory p-10">
      {/* TODO Task 2: top 10, phase banner, countdown, auto-reconnect */}
      <h1 className="font-heading text-6xl">Econ Gala</h1>
      <p className="mt-4 text-ivory/50">Display screen goes here.</p>
    </div>
  );
}
