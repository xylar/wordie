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

/**
 * How much help the player gets.
 *
 * Three points on what a player reads as one ladder, though only one of them
 * touches the answer pool. Easy narrows the *guessing* to six named choices
 * and allows two of them; hard widens the *drawing* to all 164. Normal is the
 * game as it was.
 *
 * The distinction matters for the daily round. Hard cannot go there, because
 * it would change which shelf the day gets. Easy can: the day's shelf is the
 * same at every level, and only the assistance differs.
 */
export type Level = 'easy' | 'normal' | 'hard';

/**
 * How many names easy mode offers.
 *
 * Six, against 52 in the everyday pool. A blind pick wins 1 in 6, and with a
 * second guess informed by the first one's distance and arrow, 37% before any
 * knowledge of the continent is brought to bear at all. That is the floor the
 * mode is aiming at: a player who knows nothing still finishes better than one
 * game in three, rather than one in nine.
 */
export const EASY_CHOICES = 6;

/**
 * How many of those six may be spent.
 *
 * Two, not six. Six guesses at six names is not a puzzle, it is a list being
 * read out: the last guess is always right by elimination and the arrows stop
 * mattering. Two keeps the first wrong guess worth reading.
 */
export const EASY_GUESSES = 2;

/** Which shelves a level draws its answer from. */
export const poolFor = (level: Level): Difficulty =>
  level === 'hard' ? 'all' : 'major';

/** How many guesses a level allows. */
export const guessesFor = (level: Level, standard: number): number =>
  level === 'easy' ? EASY_GUESSES : standard;

/**
 * The names easy mode puts in front of the player: the answer, and enough
 * others to fill out `size`.
 *
 * The distractors come from the same everyday pool the answer did, not from
 * all 164. A pool of obscurities would make the mode easier rather than
 * harder -- a name nobody recognises is one nobody picks -- and easy mode is
 * meant to shorten the list, not to stock it with straw men.
 *
 * Returned in name order. The set is what the player has to work with, and
 * alphabetical is the one arrangement that is quick to scan and says nothing
 * about which member is the answer.
 */
export const choiceSet = (
  pool: ShelfFeature[],
  answer: ShelfFeature,
  random: () => number = Math.random,
  size: number = EASY_CHOICES,
): ShelfFeature[] => {
  const others = pool.filter(
    (shelf) => shelf.properties.key !== answer.properties.key,
  );

  // Partial Fisher-Yates: draws without replacement, so no name can appear
  // twice and quietly shrink the list the player is choosing from.
  const wanted = Math.min(Math.max(0, size - 1), others.length);
  for (let i = 0; i < wanted; i += 1) {
    const j =
      i +
      Math.min(
        others.length - 1 - i,
        Math.floor(random() * (others.length - i)),
      );
    const a = others[i] as ShelfFeature;
    others[i] = others[j] as ShelfFeature;
    others[j] = a;
  }

  return [answer, ...others.slice(0, wanted)].sort((a, b) =>
    a.properties.name.localeCompare(b.properties.name),
  );
};
