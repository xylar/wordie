/**
 * The one day of the year the game tells a joke.
 *
 * Every shelf is drawn alone and fitted to the same square, and what that
 * does to Wilkins is hard to unsee: a round head, an arm out to either side
 * and a ragged sheet trailing off below. On 31 October it is the day's shelf,
 * and the page gets a full moon for it to drift across.
 *
 * Nothing about the geometry changes. The outline is the same one the
 * pipeline derived from BedMachine's mask on any other day -- the joke is
 * that the shape is already like that, and adjusting it by hand would throw
 * away the only reason it is funny.
 *
 * The date is UTC, for the same reason the puzzle number is: everyone has to
 * be playing the same puzzle, and a local Halloween would leave a player in
 * Auckland on a different shelf from one in Colorado for most of a day.
 */

import type { ShelfFeature } from './shelves';

/** The shelf that looks like a ghost. */
export const HALLOWEEN_KEY = 'Wilkins';

export const isHalloween = (date: Date): boolean =>
  date.getUTCMonth() === 9 && date.getUTCDate() === 31;

/**
 * The Halloween shelf, if it is Halloween and Wilkins is there to be played.
 *
 * Looked up in the pool it is handed rather than in the whole collection, so
 * the joke cannot smuggle a shelf into the daily puzzle that the daily puzzle
 * would not otherwise draw from. Wilkins is the nineteenth largest and well
 * inside the everyday 50, so this finds it; if some future version of the
 * mask renames or drops it, the day quietly falls back to the shelf the
 * rotation had for it. Losing the joke is a shame, losing the puzzle is not
 * acceptable.
 */
export const halloweenShelf = (
  pool: ShelfFeature[],
  date: Date,
): ShelfFeature | undefined =>
  isHalloween(date)
    ? pool.find((shelf) => shelf.properties.key === HALLOWEEN_KEY)
    : undefined;
