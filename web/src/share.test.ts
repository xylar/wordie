import { describe, expect, it } from 'vitest';
import { SQUARES, shareText, squaresFor } from './share';
import { createGame, submitGuess, type Game } from './game';
import type { ShelfFeature } from './shelves';

const shelf = (key: string, lon: number, lat: number): ShelfFeature => ({
  type: 'Feature',
  properties: { key, name: key, area_km2: 1000, lon, lat },
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

const ROSS = shelf('Ross', -176.2, -80.94);
const AMERY = shelf('Amery', 70.48, -70.4);
const LARSEN_C = shelf('LarsenC', -62.74, -67.48);

const played = (answer: ShelfFeature, guesses: ShelfFeature[]): Game =>
  guesses.reduce(submitGuess, createGame(answer));

describe('squaresFor', () => {
  it('fills every square for the answer', () => {
    const won = played(ROSS, [ROSS]);
    expect(squaresFor(won.guesses[0]!)).toBe('🟩'.repeat(SQUARES));
  });

  it('always leaves a wrong guess a square short', () => {
    // A full bar has to mean "got it". No wrong guess may round up to five,
    // whatever it is worth otherwise.
    for (const guess of [AMERY, LARSEN_C, shelf('Near', -176.3, -80.9)]) {
      const game = played(ROSS, [guess]);
      const squares = squaresFor(game.guesses[0]!);
      expect(squares).toContain('⬜');
    }
  });

  it('gives a nearer guess more squares than a distant one', () => {
    const near = played(ROSS, [shelf('Near', -170, -79)]).guesses[0]!;
    const far = played(ROSS, [AMERY]).guesses[0]!;
    const count = (s: string): number => (s.match(/🟩/g) ?? []).length;
    expect(count(squaresFor(near))).toBeGreaterThan(count(squaresFor(far)));
  });

  it('always draws the same number of squares', () => {
    for (const guess of [ROSS, AMERY, LARSEN_C]) {
      const game = played(ROSS, [guess]);
      expect([...squaresFor(game.guesses[0]!)]).toHaveLength(SQUARES);
    }
  });
});

describe('shareText', () => {
  const options = { puzzle: 7, url: 'https://example.test/wordie/' };

  it('leads with the puzzle and the score', () => {
    const game = played(ROSS, [AMERY, ROSS]);
    expect(shareText(game, options).split('\n')[0]).toBe('wordie #7 2/6');
  });

  it('marks a lost game with an X', () => {
    const wrong = [
      shelf('A', 0, -70),
      shelf('B', 10, -70),
      shelf('C', 20, -70),
      shelf('D', 30, -70),
      shelf('E', 40, -70),
      shelf('F', 50, -70),
    ];
    expect(shareText(played(ROSS, wrong), options)).toContain('wordie #7 X/6');
  });

  it('draws one row per guess', () => {
    const game = played(ROSS, [AMERY, LARSEN_C, ROSS]);
    const rows = shareText(game, options)
      .split('\n')
      .filter((line) => line.includes('🟩') || line.includes('⬜'));
    expect(rows).toHaveLength(3);
  });

  it('gives away neither the answer nor the distances', () => {
    // The point of the form: someone who has not played today can read it and
    // learn nothing but how much you struggled. A kilometre figure would
    // narrow it down at once for anyone who knows the continent.
    const game = played(ROSS, [AMERY, ROSS]);
    const text = shareText(game, options);

    expect(text).not.toContain('Ross');
    expect(text).not.toContain('Amery');
    expect(text).not.toContain('km');
    expect(text).not.toMatch(/\d{3,}/);
  });

  it('carries the arrow of each wrong guess but not of the right one', () => {
    const game = played(ROSS, [AMERY, ROSS]);
    const text = shareText(game, options);
    expect(text).toContain('🎉');
    expect(text).toContain(game.guesses[0]!.arrow);
  });

  it('ends with a link back to the game', () => {
    const game = played(ROSS, [ROSS]);
    expect(shareText(game, options).trimEnd().endsWith(options.url)).toBe(true);
  });
});
