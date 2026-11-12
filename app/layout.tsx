import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Fonts are loaded with a plain stylesheet link rather than next/font, so the
 * build never depends on reaching Google. If the fonts fail to load the app
 * still works, it just falls back to Georgia and the system sans.
 */

export const metadata: Metadata = {
  title: 'Econ Gala',
  description: 'Econ Ascent networking game',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#14201B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
