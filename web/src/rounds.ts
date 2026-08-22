/**
 * Which shelf to ask about, and whether the answer is shared.
 *
 * Two kinds of round, and the distinction that matters between them is not
 * difficulty but whether everyone is playing the same puzzle.
 *
 * The daily round is drawn from the everyday pool of 52 and always will be.
 * Hard mode does not touch it: if the difficulty setting changed which shelf
 * the day got, two people comparing results would be comparing different
 * puzzles, and the shared grid -- the whole reason the result is worth
 * pasting -- would quietly stop meaning anything.
 *
 * So hard mode lives in practice, where nobody is comparing anything.
 */

import { shelfForDate } from './daily';
import { answerPool, type Difficulty } from './pool';
import type { ShelfFeature } from './shelves';

export type Mode = 'daily' | 'practice';

export interface Round {
  answer: ShelfFeature;
  /** Only a daily round is saved; a practice round is meant to be thrown away. */
  persist: boolean;
}

export const dailyRound = (
  shelves: ShelfFeature[],
  date: Date,
): Round | null => {
  const answer = shelfForDate(answerPool(shelves, 'major'), date);
  return answer ? { answer, persist: true } : null;
};

/**
 * A practice round.
 *
 * `avoid` is the shelf just played, kept out of the draw so that pressing the
 * button again always changes something. With a pool of 52 the chance of a
 * repeat is small but not small enough to look like anything other than a
 * bug when it happens.
 */
export const practiceRound = (
  shelves: ShelfFeature[],
  difficulty: Difficulty,
  random: () => number = Math.random,
  avoid?: string,
): Round | null => {
  const pool = answerPool(shelves, difficulty);
  const choices =
    pool.length > 1
      ? pool.filter((shelf) => shelf.properties.key !== avoid)
      : pool;
  if (choices.length === 0) return null;

  const index = Math.min(
    choices.length - 1,
    Math.floor(random() * choices.length),
  );
  return { answer: choices[index] as ShelfFeature, persist: false };
};
