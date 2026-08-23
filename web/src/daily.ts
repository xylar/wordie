/**
 * Choosing the day's ice shelf.
 *
 * Everyone gets the same puzzle on the same day, and the same day means the
 * same UTC day. Using the local date would give someone in New Zealand a
 * different shelf from someone in Colorado for several hours, which spoils
 * comparing results — and this game's players are spread across every
 * longitude by profession.
 */

import type { ShelfFeature } from './shelves';

/** The day before puzzle one, in UTC. */
export const EPOCH_UTC = Date.UTC(2026, 7, 21);

export const puzzleNumber = (date: Date): number => {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((day - EPOCH_UTC) / 86_400_000);
};

/**
 * A small, fast PRNG with a fixed seed.
 *
 * Fixed because the order has to be the same in every player's browser and
 * the same tomorrow as today. This is mulberry32, chosen for being eight
 * lines rather than for its statistics -- all that is being asked of it is to
 * not put Ross and Ronne next to each other.
 */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const SHUFFLE_SEED = 0x1ce5;

/**
 * A fixed permutation of `length` indices.
 *
 * The day's shelf is this permutation indexed by the puzzle number, rather
 * than a hash taken modulo the pool size. Both spread the choice around; only
 * this one guarantees that every shelf comes up once before any comes up
 * twice, which over a 52 shelf pool is the difference between a rotation and
 * a lottery that repeats within the fortnight.
 */
export const puzzleOrder = (length: number): number[] => {
  const order = Array.from({ length }, (_value, index) => index);
  const random = mulberry32(SHUFFLE_SEED);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = order[i] as number;
    const b = order[j] as number;
    order[i] = b;
    order[j] = a;
  }
  return order;
};

/** The shelf for a given day, or undefined if the pool is empty. */
export const shelfForDate = (
  pool: ShelfFeature[],
  date: Date,
): ShelfFeature | undefined => {
  if (pool.length === 0) return undefined;
  const order = puzzleOrder(pool.length);
  const number = puzzleNumber(date);
  // Modulo of a negative puzzle number would index backwards; a date before
  // the epoch simply wraps rather than throwing.
  const position = ((number % pool.length) + pool.length) % pool.length;
  return pool[order[position] as number];
};

/**
 * A fixed random source for one day's easy-mode choices.
 *
 * Easy mode has to offer everyone the same six names on the same day, for the
 * same reason everyone gets the same shelf: a result of 1/2 means nothing next
 * to someone else's if the two players were choosing from different lists.
 *
 * The puzzle number is scrambled by the golden-ratio constant before seeding.
 * Consecutive days are consecutive integers, and feeding those straight in
 * would leave neighbouring days' draws correlated -- yesterday's five
 * distractors turning up again today, which reads as the game being broken
 * long before anyone works out that it is not.
 */
export const dailyRandom = (puzzle: number): (() => number) =>
  mulberry32(Math.imul(puzzle + 1, 0x9e3779b1) ^ CHOICE_SEED);

const CHOICE_SEED = 0xc401ce;
