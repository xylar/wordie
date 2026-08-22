import { describe, expect, it } from 'vitest';
import { dailyRound, practiceRound } from './rounds';
import { MAJOR_POOL_SIZE, NOTABLE_KEYS } from './pool';
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
});

describe('a practice round', () => {
  it('is not saved', () => {
    expect(practiceRound(SHELVES, 'major', () => 0)?.persist).toBe(false);
  });

  it('draws from the everyday pool by default', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      keys.add(
        practiceRound(SHELVES, 'major', () => i / 200)?.answer.properties.key ??
          '',
      );
    }
    expect(keys.size).toBe(MAJOR_TOTAL);
    expect(keys.has('S79')).toBe(false);
  });

  it('draws from everything in hard mode', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      keys.add(
        practiceRound(SHELVES, 'all', () => i / 400)?.answer.properties.key ??
          '',
      );
    }
    expect(keys.size).toBe(SHELVES.length);
    expect(keys.has('S79')).toBe(true);
  });

  it('never deals the shelf just played', () => {
    // Pressing the button again has to change something, or it looks broken.
    const first = practiceRound(SHELVES, 'major', () => 0);
    const avoid = first?.answer.properties.key;
    for (let i = 0; i < 100; i += 1) {
      const next = practiceRound(SHELVES, 'major', () => i / 100, avoid);
      expect(next?.answer.properties.key).not.toBe(avoid);
    }
  });

  it('still deals something when there is only one shelf to deal', () => {
    const only = [shelf('Ross', 1)];
    expect(
      practiceRound(only, 'all', () => 0, 'Ross')?.answer.properties.key,
    ).toBe('Ross');
  });

  it('stays in range when the random source returns its upper bound', () => {
    // Math.random is documented as excluding 1, but a stub or a future
    // implementation need not be, and an out-of-range index here would be an
    // undefined answer rather than an error anyone could read.
    expect(practiceRound(SHELVES, 'all', () => 1)).not.toBeNull();
    expect(practiceRound(SHELVES, 'all', () => 0.999999)).not.toBeNull();
  });

  it('has nothing to offer with no shelves', () => {
    expect(practiceRound([], 'all', () => 0)).toBeNull();
  });
});
