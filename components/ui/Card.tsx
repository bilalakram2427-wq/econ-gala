import type { ReactNode } from 'react';

/** A panel. Use it for anything that needs to sit apart from the background. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-2xl bg-white/70 border border-forest/10 shadow-sm p-5',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

/** One number with a label under it. Score, connections, counters. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="text-center">
      <div className="font-heading text-4xl leading-none text-bronze">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-forest/60">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-forest/45">{hint}</div> : null}
    </div>
  );
}
