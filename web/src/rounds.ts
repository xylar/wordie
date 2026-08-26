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
 * The other three levels are allowed on the daily, and the rule above is why.
 * None of them changes which shelf the day gets; they shorten the list of
 * names offered for it, the number of guesses allowed, and whether the shelf
 * is drawn in its surroundings. Everyone is still playing the same shelf. The
 * shared line carries the level so that a 1/2 is not read as a 1/6, and the
 * day's six names are drawn from the puzzle number rather than at random, so
 * that two people on the same rung really are choosing from the same list.
 */

import { dailyRandom, shelfForDate } from './daily';
import { MAX_GUESSES } from './game';
import { halloweenShelf } from './halloween';
import {
  answerPool,
  choiceSet,
  guessesFor,
  offersNames,
  poolFor,
  showsSurroundings,
  type Level,
} from './pool';
import type { ShelfFeature } from './shelves';

export type Mode = 'daily' | 'practice';

export interface Round {
  answer: ShelfFeature;
  level: Level;
  /**
   * The names the player may pick from, or null when guessing is open across
   * all 164 shelves. Easy and medium close it.
   */
  choices: ShelfFeature[] | null;
  /** Whether to draw the shelf in its surroundings. Easy alone. */
  surroundings: boolean;
  maxGuesses: number;
  /** Only a daily round is saved; a practice round is meant to be thrown away. */
  persist: boolean;
}

/**
 * The day's puzzle.
 *
 * Halloween is the one exception to the rotation, and it is an exception
 * rather than a reordering: the shelf the rotation had for 31 October is
 * skipped that year, not pushed along, so every other day of every other year
 * gets the shelf it would have got anyway. Wilkins keeps its own place in the
 * rotation too, which is why it can come up twice in the same autumn -- the
 * alternative is a rotation that shifts under everyone once a year to protect
 * a joke.
 *
 * It is still an ordinary daily round: the same pool, saved the same way, and
 * the easier levels still allowed to shorten the list of names offered for it.
 */
export const dailyRound = (
  shelves: ShelfFeature[],
  date: Date,
  level: Level = 'medium',
  puzzle = 0,
): Round | null => {
  const pool = answerPool(shelves, 'major');
  const answer = halloweenShelf(pool, date) ?? shelfForDate(pool, date);
  if (!answer) return null;
  return {
    answer,
    level,
    choices: offersNames(level)
      ? choiceSet(pool, answer, dailyRandom(puzzle))
      : null,
    surroundings: showsSurroundings(level),
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
    choices: offersNames(level) ? choiceSet(pool, answer, random) : null,
    surroundings: showsSurroundings(level),
    maxGuesses: guessesFor(level, MAX_GUESSES),
    persist: false,
  };
};
