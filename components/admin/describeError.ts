import { ERROR_TEXT, type ApiError } from '@/lib/types';

/**
 * Turns an ApiError into one readable sentence for the admin screen.
 *
 * Known codes use the shared friendly text from lib/types.ts. When the server
 * refuses something with a message we have no code for (for example an illegal
 * phase jump), show that message as words instead of failing silently or
 * printing "UNKNOWN". Admins are the only people who see this.
 *
 * TODO (ask Bilal): add an ILLEGAL_TRANSITION code to lib/types.ts so this
 * special case can go away.
 */
export function describeAdminError(err: ApiError): string {
  if (err.code === 'UNKNOWN') {
    const raw = (err.message ?? '').split('|')[0].trim();
    if (raw) {
      const words = /^[A-Z0-9_]+$/.test(raw) ? raw.toLowerCase().replace(/_/g, ' ') : raw;
      return `The server refused that: ${words}.`;
    }
  }
  return ERROR_TEXT[err.code];
}
