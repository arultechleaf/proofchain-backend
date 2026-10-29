import { SetMetadata } from '@nestjs/common';

export const SCREEN_KEY = 'screen_access';

export interface ScreenMeta {
  /** Screens that allow a read (GET). The highest level among them counts. */
  read: string[];
  /** Screens that allow a change (POST/PUT/PATCH/DELETE). */
  write: string[];
}

/**
 * Ties a controller or handler to a screen of the role matrix.
 *   @Screen('parties')                                   reads and writes both need the "parties" screen
 *   @Screen('parties', { readAlso: ['sales', 'items'] })  a user with only the "sales" screen may still read parties
 *   @Screen('sales', { writeAlso: ['purchases'] })        either screen allows the change
 * Levels: none = blocked, read = reads only, own / full = reads and writes.
 */
export const Screen = (screen: string, opts: { readAlso?: string[]; writeAlso?: string[] } = {}) =>
  SetMetadata(SCREEN_KEY, {
    read: [screen, ...(opts.readAlso ?? []), ...(opts.writeAlso ?? [])],
    write: [screen, ...(opts.writeAlso ?? [])],
  } satisfies ScreenMeta);
