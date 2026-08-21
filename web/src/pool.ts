/**
 * Which ice shelves the game can ask about.
 *
 * Guessing is open: any of the 164 named shelves can be offered as a guess,
 * because a wrong guess is only useful if it tells you where you are. What is
 * restricted is the answer. A daily puzzle drawn from all 164 would spend most
 * of the year on 20 km2 inlets nobody outside one field season has heard of.
 */

import type { ShelfFeature } from './shelves';

export type Difficulty = 'major' | 'all';

/**
 * How many shelves the everyday pool takes, ranked by area.
 *
 * Ranking by area is a stand-in for fame, and a surprisingly good one: the
 * largest 50 contain Ross, the Filchner-Ronne, Amery, Larsen B through D,
 * George VI, Wilkins, Pine Island, Thwaites, Getz, Totten, Shackleton and the
 * whole Dronning Maud Land chain. It needs help in only one place.
 */
export const MAJOR_POOL_SIZE = 50;

/**
 * The shelves that are famous for having gone.
 *
 * Area rank cannot see this, and it is the one thing it misses. Wordie
 * disintegrated from the 1960s and was gone by 2004; Larsen A went in 1995.
 * Both are far too small to make the top 50 and far too well known to leave
 * out — and Wordie is what the game is named after. Larsen B, the third of
 * the Peninsula collapses, is large enough to qualify on its own.
 */
export const NOTABLE_KEYS: readonly string[] = ['Wordie', 'LarsenA'];

/**
 * The shelves that can be the answer, in a stable order.
 *
 * Sorted by key rather than by area so that the order does not shift when a
 * new version of BedMachine moves two shelves past each other. The daily
 * puzzle indexes into this, so a reshuffle would change which shelf every
 * future day gets.
 */
export const answerPool = (
  shelves: ShelfFeature[],
  difficulty: Difficulty = 'major',
): ShelfFeature[] => {
  const chosen =
    difficulty === 'all'
      ? [...shelves]
      : (() => {
          const byArea = [...shelves].sort(
            (a, b) => b.properties.area_km2 - a.properties.area_km2,
          );
          const major = byArea.slice(0, MAJOR_POOL_SIZE);
          const keys = new Set(major.map((shelf) => shelf.properties.key));
          const notable = shelves.filter(
            (shelf) =>
              NOTABLE_KEYS.includes(shelf.properties.key) &&
              !keys.has(shelf.properties.key),
          );
          return [...major, ...notable];
        })();

  return chosen.sort((a, b) =>
    a.properties.key.localeCompare(b.properties.key),
  );
};
