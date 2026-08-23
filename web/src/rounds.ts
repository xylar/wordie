/**
 * Which shelf to ask about, how much help to give, and whether the answer is
 * shared.
 *
 * Two kinds of round, and the distinction that matters between them is not
 * difficulty but whether everyone is playing the same puzzle.
 *
 * The daily round is drawn from the everyday pool of 52 and always will be.
 * Hard mode does not touch it: if it changed which shelf the day got, two
 * people comparing results would be comparing different puzzles, and the
 * shared grid -- the whole reason the result is worth pasting -- would quietly
 * stop meaning anything.
 *
 * So hard mode lives in practice, where nobody is comparing anything.
 *
 * Easy mode is allowed on the daily, and the rule above is why. It does not
 * change which shelf the day gets; it shortens the list of names offered for
 * it and the number of guesses allowed. Everyone is still playing the same
 * shelf. The shared line carries the level so that a 1/2 is not read as a 1/6,
 * and the day's six names are drawn from the puzzle number rather than at
 * random, so that two people on easy really are choosing from the same list.
 */

import { dailyRandom, shelfForDate } from './daily';
import { MAX_GUESSES } from './game';
import { answerPool, choiceSet, guessesFor, poolFor, type Level } from './pool';
import type { ShelfFeature } from './shelves';

export type Mode = 'daily' | 'practice';

export interface Round {
  answer: ShelfFeature;
  level: Level;
  /**
   * The names the player may pick from, or null when guessing is open across
   * all 164 shelves. Only easy mode closes it.
   */
  choices: ShelfFeature[] | null;
  maxGuesses: number;
  /** Only a daily round is saved; a practice round is meant to be thrown away. */
  persist: boolean;
}

export const dailyRound = (
  shelves: ShelfFeature[],
  date: Date,
  level: Level = 'normal',
  puzzle = 0,
): Round | null => {
  const pool = answerPool(shelves, 'major');
  const answer = shelfForDate(pool, date);
  if (!answer) return null;
  return {
    answer,
    level,
    choices:
      level === 'easy' ? choiceSet(pool, answer, dailyRandom(puzzle)) : null,
    maxGuesses: guessesFor(level, MAX_GUESSES),
    persist: true,
  };
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
  level: Level,
  random: () => number = Math.random,
  avoid?: string,
): Round | null => {
  const pool = answerPool(shelves, poolFor(level));
  const choices =
    pool.length > 1
      ? pool.filter((shelf) => shelf.properties.key !== avoid)
      : pool;
  if (choices.length === 0) return null;

  const index = Math.min(
    choices.length - 1,
    Math.floor(random() * choices.length),
  );
  const answer = choices[index] as ShelfFeature;
  return {
    answer,
    level,
    // Drawn from the whole pool, not from `choices`: the shelf just played is
    // kept out of the *answer* draw, but it is a perfectly good distractor and
    // leaving it out would make its absence a tell.
    choices: level === 'easy' ? choiceSet(pool, answer, random) : null,
    maxGuesses: guessesFor(level, MAX_GUESSES),
    persist: false,
  };
};
