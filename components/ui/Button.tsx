'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a spinner and disables the button. Use while a request is in flight. */
  busy?: boolean;
  full?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-bronze text-ivory hover:bg-bronze-dark active:bg-bronze-dark',
  secondary: 'bg-transparent text-forest border-2 border-forest/25 hover:border-forest/50',
  ghost: 'bg-transparent text-bronze underline underline-offset-4',
  danger: 'bg-red-800 text-ivory hover:bg-red-900',
};

/**
 * The only button in the app. 48px tall minimum, because people are outdoors,
 * standing, often holding something.
 */
export function Button({
  variant = 'primary',
  busy = false,
  full = false,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={[
        'min-h-tap px-5 rounded-xl font-medium text-base',
        'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze',
        VARIANTS[variant],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
