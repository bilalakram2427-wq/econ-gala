import type { Config } from 'tailwindcss';

/**
 * Brand values come from spec section 15. If you change one here, change the
 * matching entry in lib/config.ts and app/globals.css too.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ivory: '#F3EEE5',
        bronze: {
          DEFAULT: '#7A5C2E',
          light: '#9A7840',
          dark: '#5B4322',
        },
        forest: {
          DEFAULT: '#14201B',
          light: '#24352D',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      minHeight: {
        tap: '48px',
      },
      minWidth: {
        tap: '48px',
      },
    },
  },
  plugins: [],
};

export default config;
