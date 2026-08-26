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
 * Four rungs, and three different kinds of help, which is why they are not
 * simply four different numbers of guesses.
 *
 * - **easy** offers six names, two guesses at them, and draws the shelf in
 *   its surroundings, so the sea is on one side and the land on the other.
 * - **medium** takes the surroundings away and leaves the outline alone in
 *   its box. Six names is still a real puzzle: recognising a shape you have
 *   only ever seen at the scale of a continent is most of the difficulty,
 *   and a short list only says which shapes it might be.
 * - **hard** opens the guessing to all 164 names, with six guesses to spend
 *   on finding one.
 * - **insane** draws the answer from all 164 as well, so the shelf can be a
 *   20 km inlet nobody outside one field season has heard of.
 *
 * Only insane touches the answer pool, and that is the line that matters for
 * the daily round. It cannot go there: it would change which shelf the day
 * gets, and two people comparing results would be comparing different
 * puzzles. The other three change only the assistance, so everyone playing
 * the day is still naming the same outline.
 */
export type Level = 'easy' | 'medium' | 'hard' | 'insane';

/**
 * How many names the two closed-list levels offer.
 *
 * Six, against 52 in the everyday pool. A blind pick wins 1 in 6, and with a
 * second guess informed by the first one's distance and arrow, 37% before any
 * knowledge of the continent is brought to bear at all. That is the floor
 * these levels aim at: a player who knows nothing still finishes better than
 * one game in three, rather than one in nine.
 */
export const OFFERED_NAMES = 6;

/**
 * How many of those six may be spent.
 *
 * Two, not six. Six guesses at six names is not a puzzle, it is a list being
 * read out: the last guess is always right by elimination and the arrows stop
 * mattering. Two keeps the first wrong guess worth reading.
 */
export const OFFERED_GUESSES = 2;

/** Which shelves a level draws its answer from. */
export const poolFor = (level: Level): Difficulty =>
  level === 'insane' ? 'all' : 'major';

/** Whether a level shortens the list of names instead of opening it. */
export const offersNames = (level: Level): boolean =>
  level === 'easy' || level === 'medium';

/**
 * Whether a level draws the shelf in its surroundings.
 *
 * Easy alone. It is the largest single piece of help in the game -- which
 * edge faces the sea is most of what a shelf is recognised by -- so it is
 * the first thing the ladder takes away.
 */
export const showsSurroundings = (level: Level): boolean => level === 'easy';

/**
 * How many guesses a level allows.
 *
 * The short list and the short count of guesses are the same decision, so
 * this asks the same question rather than repeating the list of levels.
 */
export const guessesFor = (level: Level, standard: number): number =>
  offersNames(level) ? OFFERED_GUESSES : standard;

/**
 * The names a closed-list level puts in front of the player: the answer, and
 * enough others to fill out `size`.
 *
 * The distractors come from the same everyday pool the answer did, not from
 * all 164. A pool of obscurities would make the level easier rather than
 * harder -- a name nobody recognises is one nobody picks -- and a short list
 * is meant to shorten the choice, not to stock it with straw men.
 *
 * Returned in name order. The set is what the player has to work with, and
 * alphabetical is the one arrangement that is quick to scan and says nothing
 * about which member is the answer.
 */
export const choiceSet = (
  pool: ShelfFeature[],
  answer: ShelfFeature,
  random: () => number = Math.random,
  size: number = OFFERED_NAMES,
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
