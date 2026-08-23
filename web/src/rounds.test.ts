import { describe, expect, it } from 'vitest';
import { dailyRound, practiceRound } from './rounds';
import {
  EASY_CHOICES,
  EASY_GUESSES,
  MAJOR_POOL_SIZE,
  NOTABLE_KEYS,
} from './pool';
import type { ShelfFeature } from './shelves';

const shelf = (key: string, area: number): ShelfFeature => ({
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

// Eighty shelves by area, plus the two that are famous for having gone.
const SHELVES: ShelfFeature[] = [
  ...Array.from({ length: 80 }, (_v, i) =>
    shelf(`S${String(i).padStart(2, '0')}`, 100_000 - i * 100),
  ),
  shelf('Wordie', 213),
  shelf('LarsenA', 667),
];

const MAJOR_TOTAL = MAJOR_POOL_SIZE + NOTABLE_KEYS.length;

describe('the daily round', () => {
  const date = new Date('2026-09-01T12:00:00Z');

  it('is the same shelf for everyone on the same day', () => {
    expect(dailyRound(SHELVES, date)?.answer.properties.key).toBe(
      dailyRound(SHELVES, date)?.answer.properties.key,
    );
  });

  it('is saved, so a refresh does not lose it', () => {
    expect(dailyRound(SHELVES, date)?.persist).toBe(true);
  });

  it('always comes from the everyday pool', () => {
    // The point of this test, and of the design. If the difficulty setting
    // changed which shelf the day got, two people comparing results would be
    // comparing different puzzles, and the shared grid would quietly stop
    // meaning anything.
    const answers = new Set<string>();
    for (let day = 0; day < 60; day += 1) {
      const on = new Date(Date.UTC(2026, 7, 21 + day));
      answers.add(dailyRound(SHELVES, on)?.answer.properties.key ?? '');
    }
    expect(answers.size).toBe(MAJOR_TOTAL);
    // Nothing outside the everyday pool ever comes up.
    expect(answers.has('S79')).toBe(false);
  });

  it('has nothing to offer with no shelves', () => {
    expect(dailyRound([], date)).toBeNull();
  });

  it('is the same shelf at every level', () => {
    // The whole reason easy is allowed here and hard is not. Easy shortens
    // the list of names offered for the day's shelf; it does not change which
    // shelf the day gets, so two people on different levels are still playing
    // the same puzzle.
    const normal = dailyRound(SHELVES, date, 'normal', 11);
    const easy = dailyRound(SHELVES, date, 'easy', 11);
    expect(easy?.answer.properties.key).toBe(normal?.answer.properties.key);
  });

  it('offers everyone the same six names on the same day', () => {
    // A 1/2 means nothing next to somebody else's if the two of them were
    // choosing from different lists.
    const names = (puzzle: number): string[] =>
      dailyRound(SHELVES, date, 'easy', puzzle)?.choices?.map(
        (shelf) => shelf.properties.key,
      ) ?? [];
    expect(names(11)).toEqual(names(11));
    expect(names(11).length).toBe(EASY_CHOICES);
  });

  it('does not offer the same six two days running', () => {
    // Puzzle numbers are consecutive integers. Seeding straight off them
    // would leave neighbouring days correlated, and yesterday's distractors
    // coming back today reads as the game being broken.
    const names = (puzzle: number): Set<string> =>
      new Set(
        dailyRound(SHELVES, date, 'easy', puzzle)?.choices?.map(
          (shelf) => shelf.properties.key,
        ),
      );
    for (let day = 0; day < 30; day += 1) {
      const shared = [...names(day)].filter((key) => names(day + 1).has(key));
      expect(shared.length).toBeLessThan(EASY_CHOICES);
    }
  });

  it('leaves guessing open above easy', () => {
    expect(dailyRound(SHELVES, date, 'normal', 11)?.choices).toBeNull();
  });

  it('allows two guesses on easy and six otherwise', () => {
    expect(dailyRound(SHELVES, date, 'easy', 11)?.maxGuesses).toBe(
      EASY_GUESSES,
    );
    expect(dailyRound(SHELVES, date, 'normal', 11)?.maxGuesses).toBe(6);
  });
});

describe('a practice round', () => {
  it('is not saved', () => {
    expect(practiceRound(SHELVES, 'normal', () => 0)?.persist).toBe(false);
  });

  it('draws from the everyday pool by default', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      keys.add(
        practiceRound(SHELVES, 'normal', () => i / 200)?.answer.properties
          .key ?? '',
      );
    }
    expect(keys.size).toBe(MAJOR_TOTAL);
    expect(keys.has('S79')).toBe(false);
  });

  it('draws from everything in hard mode', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      keys.add(
        practiceRound(SHELVES, 'hard', () => i / 400)?.answer.properties.key ??
          '',
      );
    }
    expect(keys.size).toBe(SHELVES.length);
    expect(keys.has('S79')).toBe(true);
  });

  it('never deals the shelf just played', () => {
    // Pressing the button again has to change something, or it looks broken.
    const first = practiceRound(SHELVES, 'normal', () => 0);
    const avoid = first?.answer.properties.key;
    for (let i = 0; i < 100; i += 1) {
      const next = practiceRound(SHELVES, 'normal', () => i / 100, avoid);
      expect(next?.answer.properties.key).not.toBe(avoid);
    }
  });

  it('still deals something when there is only one shelf to deal', () => {
    const only = [shelf('Ross', 1)];
    expect(
      practiceRound(only, 'hard', () => 0, 'Ross')?.answer.properties.key,
    ).toBe('Ross');
  });

  it('stays in range when the random source returns its upper bound', () => {
    // Math.random is documented as excluding 1, but a stub or a future
    // implementation need not be, and an out-of-range index here would be an
    // undefined answer rather than an error anyone could read.
    expect(practiceRound(SHELVES, 'hard', () => 1)).not.toBeNull();
    expect(practiceRound(SHELVES, 'hard', () => 0.999999)).not.toBeNull();
  });

  it('has nothing to offer with no shelves', () => {
    expect(practiceRound([], 'hard', () => 0)).toBeNull();
  });

  it('offers a closed list on easy, and the answer is in it', () => {
    for (let i = 0; i < 100; i += 1) {
      const round = practiceRound(SHELVES, 'easy', () => i / 100);
      expect(round?.choices).toHaveLength(EASY_CHOICES);
      expect(
        round?.choices?.some(
          (shelf) => shelf.properties.key === round.answer.properties.key,
        ),
      ).toBe(true);
    }
  });

  it('can still offer the shelf just played as a distractor', () => {
    // It is kept out of the *answer* draw so that a new round always changes
    // something. Keeping it out of the choices too would make its absence a
    // tell: the one name that cannot be the answer.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const round = practiceRound(SHELVES, 'easy', () => i / 200, 'S00');
      for (const shelf of round?.choices ?? []) seen.add(shelf.properties.key);
    }
    expect(seen.has('S00')).toBe(true);
  });
});
