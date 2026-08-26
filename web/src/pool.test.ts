import { describe, expect, it } from 'vitest';
import {
  OFFERED_NAMES,
  answerPool,
  choiceSet,
  guessesFor,
  offersNames,
  showsSurroundings,
  poolFor,
} from './pool';
import type { ShelfFeature } from './shelves';

const shelf = (key: string, area = 1000): ShelfFeature => ({
  type: 'Feature',
  properties: { key, name: key, area_km2: area, lon: 0, lat: -70 },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    ],
  },
});

const POOL = Array.from({ length: 52 }, (_v, i) =>
  shelf(`S${String(i).padStart(2, '0')}`, 100_000 - i * 100),
);
const ANSWER = POOL[7] as ShelfFeature;

/** A random source that walks the unit interval, so a draw is reproducible. */
const walking = (start = 0.13, step = 0.37): (() => number) => {
  let at = start;
  return () => {
    at = (at + step) % 1;
    return at;
  };
};

describe('which shelves a level plays with', () => {
  it('widens the answer pool only on insane', () => {
    // The line that matters for the daily round: every other level plays the
    // same shelf as everybody else and differs only in the help it gives.
    expect(poolFor('easy')).toBe('major');
    expect(poolFor('medium')).toBe('major');
    expect(poolFor('hard')).toBe('major');
    expect(poolFor('insane')).toBe('all');
  });

  it('shortens the guesses exactly where it shortens the list', () => {
    // Two guesses is not a separate decision from six names: six guesses at
    // six names is a list being read out.
    expect(guessesFor('easy', 6)).toBe(2);
    expect(guessesFor('medium', 6)).toBe(2);
    expect(guessesFor('hard', 6)).toBe(6);
    expect(guessesFor('insane', 6)).toBe(6);
  });

  it('closes the list of names on the two lower rungs', () => {
    expect(offersNames('easy')).toBe(true);
    expect(offersNames('medium')).toBe(true);
    expect(offersNames('hard')).toBe(false);
    expect(offersNames('insane')).toBe(false);
  });

  it('draws the surroundings on easy alone', () => {
    // The largest single piece of help in the game, and so the first thing
    // the ladder takes away: medium is easy with the map switched off.
    expect(showsSurroundings('easy')).toBe(true);
    expect(showsSurroundings('medium')).toBe(false);
    expect(showsSurroundings('hard')).toBe(false);
    expect(showsSurroundings('insane')).toBe(false);
  });
});

describe('the closed list of names', () => {
  it('is six names including the answer', () => {
    const choices = choiceSet(POOL, ANSWER, walking());
    expect(choices).toHaveLength(OFFERED_NAMES);
    expect(choices.map((s) => s.properties.key)).toContain(
      ANSWER.properties.key,
    );
  });

  it('never repeats a name', () => {
    // A duplicate would quietly shrink the list the player is choosing from,
    // which is the one number the mode's difficulty rests on.
    for (let i = 0; i < 200; i += 1) {
      const choices = choiceSet(POOL, ANSWER, walking(i / 200, 0.37));
      const keys = new Set(choices.map((s) => s.properties.key));
      expect(keys.size).toBe(choices.length);
    }
  });

  it('is in name order, so the answer has no home slot', () => {
    const choices = choiceSet(POOL, ANSWER, walking());
    const names = choices.map((s) => s.properties.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('puts the answer somewhere other than one fixed position', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const choices = choiceSet(POOL, ANSWER, walking(i / 200, 0.37));
      positions.add(
        choices.findIndex((s) => s.properties.key === ANSWER.properties.key),
      );
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('draws its distractors from the pool it was given', () => {
    const major = answerPool(POOL, 'major');
    const keys = new Set(major.map((s) => s.properties.key));
    for (let i = 0; i < 50; i += 1) {
      for (const choice of choiceSet(major, ANSWER, walking(i / 50, 0.37))) {
        expect(keys.has(choice.properties.key)).toBe(true);
      }
    }
  });

  it('offers what it can when the pool is smaller than the list', () => {
    const tiny = [ANSWER, shelf('Other')];
    expect(choiceSet(tiny, ANSWER, walking())).toHaveLength(2);
    expect(choiceSet([ANSWER], ANSWER, walking())).toHaveLength(1);
  });

  it('stays in range when the random source returns its upper bound', () => {
    // Math.random is documented as excluding 1, but a stub or a future
    // implementation need not be, and an out-of-range index here would put an
    // undefined among the names on screen.
    const choices = choiceSet(POOL, ANSWER, () => 1);
    expect(choices).toHaveLength(OFFERED_NAMES);
    expect(choices.every(Boolean)).toBe(true);
  });
});
