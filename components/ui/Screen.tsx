import type { ReactNode } from 'react';

/**
 * The outer wrapper for every guest and staff screen. Keeps one gutter width
 * and one max width across the app, so screens built by different people still
 * line up when we put them together.
 */
export function Screen({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-5 space-y-4">
        {title ? (
          <h1 className="font-heading text-3xl text-forest">{title}</h1>
        ) : null}
        {children}
      </main>
      {footer ? (
        <footer className="w-full max-w-md mx-auto px-4 pb-6 pt-2">{footer}</footer>
      ) : null}
    </div>
  );
}

/** Centred message for empty, blocked and waiting states. */
export function CenteredNote({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        <h2 className="font-heading text-2xl text-forest">{heading}</h2>
        {children ? <div className="text-forest/70">{children}</div> : null}
      </div>
    </div>
  );
}

/** Full-screen spinner for the first load of a screen. */
export function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <span
        aria-label="Loading"
        role="status"
        className="h-8 w-8 rounded-full border-2 border-bronze border-t-transparent animate-spin"
      />
    </div>
  );
}
