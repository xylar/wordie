import { describe, expect, it } from 'vitest';
import {
  MAX_GUESSES,
  PROXIMITY_SCALE_KM,
  canGuess,
  createGame,
  guessesRemaining,
  matchingShelves,
  normalise,
  scoreGuess,
  submitGuess,
} from './game';
import { answerPool, MAJOR_POOL_SIZE, NOTABLE_KEYS } from './pool';
import { puzzleNumber, puzzleOrder, shelfForDate } from './daily';
import type { ShelfFeature } from './shelves';

const shelf = (
  key: string,
  lon: number,
  lat: number,
  area = 1000,
  name = key,
): ShelfFeature => ({
  type: 'Feature',
  properties: { key, name, area_km2: area, lon, lat },
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

const ROSS = shelf('Ross', -176.2, -80.94, 499470, 'Ross');
const AMERY = shelf('Amery', 70.48, -70.4, 60373, 'Amery');
const LARSEN_C = shelf('LarsenC', -62.74, -67.48, 46078, 'Larsen C');

describe('scoreGuess', () => {
  it('marks the answer correct and gives it zero distance', () => {
    const result = scoreGuess(ROSS, ROSS);
    expect(result.correct).toBe(true);
    expect(result.distanceKm).toBe(0);
    expect(result.proximity).toBe(1);
  });

  it('reports the distance in kilometres', () => {
    const result = scoreGuess(ROSS, AMERY);
    expect(result.distanceKm).toBeGreaterThan(2500);
    expect(result.distanceKm).toBeLessThan(3500);
  });

  it('points the way the map does', () => {
    // The case the whole bearing convention exists for: Amery is up and to
    // the right of Ross on any Antarctic map, though the great circle
    // between them sets off southwest.
    const result = scoreGuess(ROSS, AMERY);
    expect(result.bearingDeg).toBeGreaterThan(0);
    expect(result.bearingDeg).toBeLessThan(90);
    expect(result.arrow).toBe('↗️');
  });

  it('scales proximity against the width of the continent', () => {
    // Not against half the earth, which would leave every guess above 85%.
    const near = scoreGuess(ROSS, ROSS);
    const far = scoreGuess(LARSEN_C, AMERY);
    expect(near.proximity).toBe(1);
    expect(far.proximity).toBeLessThan(0.6);
    expect(far.proximity).toBeGreaterThan(0);
  });

  it('never reports a negative proximity', () => {
    const antipodal = shelf('Far', 0, 0);
    expect(scoreGuess(antipodal, ROSS).proximity).toBeGreaterThanOrEqual(0);
    expect(PROXIMITY_SCALE_KM).toBeGreaterThan(5444);
  });
});

describe('submitGuess', () => {
  it('is won by the right answer', () => {
    const game = submitGuess(createGame(ROSS), ROSS);
    expect(game.status).toBe('won');
    expect(game.guesses).toHaveLength(1);
  });

  it('stays in play after a wrong guess', () => {
    const game = submitGuess(createGame(ROSS), AMERY);
    expect(game.status).toBe('playing');
    expect(guessesRemaining(game)).toBe(MAX_GUESSES - 1);
  });

  it('is lost when the guesses run out', () => {
    const others = [
      shelf('A', 0, -70),
      shelf('B', 10, -70),
      shelf('C', 20, -70),
      shelf('D', 30, -70),
      shelf('E', 40, -70),
      shelf('F', 50, -70),
    ];
    const game = others.reduce(submitGuess, createGame(ROSS));
    expect(game.status).toBe('lost');
    expect(guessesRemaining(game)).toBe(0);
  });

  it('can still be won on the last guess', () => {
    const others = [
      shelf('A', 0, -70),
      shelf('B', 10, -70),
      shelf('C', 20, -70),
      shelf('D', 30, -70),
      shelf('E', 40, -70),
    ];
    const game = submitGuess(
      others.reduce(submitGuess, createGame(ROSS)),
      ROSS,
    );
    expect(game.status).toBe('won');
  });

  it('refuses a repeated guess rather than spending one of six', () => {
    const once = submitGuess(createGame(ROSS), AMERY);
    const twice = submitGuess(once, AMERY);
    expect(twice.guesses).toHaveLength(1);
    expect(canGuess(once, AMERY)).toBe(false);
  });

  it('accepts nothing once the game is over', () => {
    const won = submitGuess(createGame(ROSS), ROSS);
    expect(submitGuess(won, AMERY)).toBe(won);
  });

  it('does not mutate the game it was given', () => {
    const start = createGame(ROSS);
    submitGuess(start, AMERY);
    expect(start.guesses).toHaveLength(0);
  });
});

describe('matchingShelves', () => {
  const all = [
    ROSS,
    AMERY,
    LARSEN_C,
    shelf('Crosson', -110, -75, 3228, 'Crosson'),
    shelf('LarsenB', -61, -65, 1947, 'Larsen B'),
    shelf('Ekstrom', -8, -71, 6886, 'Ekström'),
  ];

  it('finds a shelf by any part of its name', () => {
    const names = matchingShelves(all, 'larsen').map((s) => s.properties.name);
    expect(names).toContain('Larsen B');
    expect(names).toContain('Larsen C');
  });

  it('offers a name that starts with the query before one that contains it', () => {
    // Typing "ross" should reach Ross before Crosson.
    expect(matchingShelves(all, 'ross')[0]?.properties.name).toBe('Ross');
  });

  it('ignores accents, so Ekstrom finds Ekström', () => {
    expect(matchingShelves(all, 'ekstrom')[0]?.properties.name).toBe('Ekström');
  });

  it('ignores case and surrounding space', () => {
    expect(matchingShelves(all, '  AMERY ')).toHaveLength(1);
  });

  it('offers nothing for an empty query', () => {
    expect(matchingShelves(all, '   ')).toEqual([]);
  });

  it('caps how many it offers', () => {
    expect(matchingShelves(all, 'a', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('normalise', () => {
  it('strips the marks the dataset could not carry', () => {
    expect(normalise('Ekström')).toBe('ekstrom');
    expect(normalise('Nordenskjöld')).toBe('nordenskjold');
    expect(normalise('Zélée')).toBe('zelee');
  });
});

describe('answerPool', () => {
  const many = Array.from({ length: 80 }, (_v, i) =>
    shelf(`S${String(i).padStart(2, '0')}`, i, -70, 100000 - i * 100),
  ).concat([shelf('Wordie', -67, -69, 213), shelf('LarsenA', -60, -65, 667)]);

  it('takes the largest shelves, plus the ones famous for collapsing', () => {
    const pool = answerPool(many, 'major');
    const keys = pool.map((s) => s.properties.key);

    expect(pool).toHaveLength(MAJOR_POOL_SIZE + NOTABLE_KEYS.length);
    for (const key of NOTABLE_KEYS) expect(keys).toContain(key);
    expect(keys).toContain('S00');
    expect(keys).not.toContain('S79');
  });

  it('takes everything in hard mode', () => {
    expect(answerPool(many, 'all')).toHaveLength(many.length);
  });

  it('does not list a notable shelf twice if it is already large enough', () => {
    const withBigWordie = [
      ...many.slice(0, 10),
      shelf('Wordie', -67, -69, 999999),
    ];
    const keys = answerPool(withBigWordie, 'major').map(
      (s) => s.properties.key,
    );
    expect(keys.filter((k) => k === 'Wordie')).toHaveLength(1);
  });

  it('is ordered by key, not by area', () => {
    // The daily puzzle indexes into this, so a reordering would change which
    // shelf every future day gets.
    const keys = answerPool(many, 'major').map((s) => s.properties.key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });
});

describe('the daily puzzle', () => {
  const pool = Array.from({ length: 52 }, (_v, i) =>
    shelf(`S${String(i).padStart(2, '0')}`, i, -70),
  );

  it('counts days from the epoch', () => {
    expect(puzzleNumber(new Date('2026-08-21T00:00:00Z'))).toBe(0);
    expect(puzzleNumber(new Date('2026-08-22T00:00:00Z'))).toBe(1);
    expect(puzzleNumber(new Date('2026-09-20T00:00:00Z'))).toBe(30);
  });

  it('uses the UTC day, not the local one', () => {
    // Players are spread across every longitude by profession; the local date
    // would give them different shelves for several hours each day.
    const lateUtc = new Date('2026-08-22T23:59:00Z');
    const earlyUtc = new Date('2026-08-22T00:01:00Z');
    expect(puzzleNumber(lateUtc)).toBe(puzzleNumber(earlyUtc));
  });

  it('gives everyone the same shelf on the same day', () => {
    const date = new Date('2026-09-01T12:00:00Z');
    expect(shelfForDate(pool, date)).toBe(shelfForDate(pool, date));
  });

  it('changes from one day to the next', () => {
    const a = shelfForDate(pool, new Date('2026-09-01T00:00:00Z'));
    const b = shelfForDate(pool, new Date('2026-09-02T00:00:00Z'));
    expect(a?.properties.key).not.toBe(b?.properties.key);
  });

  it('uses every shelf before repeating any', () => {
    // A rotation rather than a lottery: hashing modulo the pool size would
    // repeat within the fortnight on a pool this size.
    const seen = new Set<string>();
    for (let day = 0; day < pool.length; day += 1) {
      const date = new Date(Date.UTC(2026, 7, 21 + day));
      seen.add(shelfForDate(pool, date)?.properties.key ?? '');
    }
    expect(seen.size).toBe(pool.length);
  });

  it('wraps rather than failing before the epoch', () => {
    expect(shelfForDate(pool, new Date('2020-01-01T00:00:00Z'))).toBeDefined();
  });

  it('has nothing to offer from an empty pool', () => {
    expect(shelfForDate([], new Date())).toBeUndefined();
  });

  it('permutes without losing or duplicating an index', () => {
    const order = puzzleOrder(52);
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 52 }, (_v, i) => i),
    );
  });
});
