import { describe, expect, it } from 'vitest';
import { boundsOf, outlinePath, type ShelfFeature } from './shelves';

const feature = (coordinates: number[][][][]): ShelfFeature => ({
  type: 'Feature',
  properties: { key: 'Test', name: 'Test', area_km2: 1, lon: 0, lat: -70 },
  geometry: { type: 'MultiPolygon', coordinates },
});

const square = (x0: number, y0: number, size: number): number[][] => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
];

const points = (path: string): [number, number][] =>
  [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);

describe('boundsOf', () => {
  it('spans every ring of every polygon', () => {
    const shelf = feature([[square(0, 0, 10)], [square(100, 50, 10)]]);
    expect(boundsOf(shelf)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 110,
      maxY: 60,
    });
  });

  it('refuses a shelf with no extent', () => {
    const degenerate = feature([
      [
        [
          [5, 5],
          [5, 5],
          [5, 5],
        ],
      ],
    ]);
    expect(() => boundsOf(degenerate)).toThrow(/no extent/);
  });
});

describe('outlinePath', () => {
  it('does not distort the shape', () => {
    // Stretching a shelf to fill its box would be a lie about its outline,
    // and this audience compares shapes for a living.
    const wide = feature([
      [
        [
          [0, 0],
          [400, 0],
          [400, 100],
          [0, 100],
          [0, 0],
        ],
      ],
    ]);
    const drawn = points(outlinePath(wide));

    const xs = drawn.map(([x]) => x);
    const ys = drawn.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(width / height).toBeCloseTo(4, 2);
  });

  it('draws north up', () => {
    // The map's y axis runs north and SVG's runs down the page. Getting this
    // wrong flips every shelf, which on outlines this irregular is not
    // obvious until one sits beside a map.
    const tall = feature([
      [
        [
          [0, 0],
          [10, 0],
          [10, 100],
          [0, 100],
          [0, 0],
        ],
      ],
    ]);
    const drawn = points(outlinePath(tall));

    const northern = drawn.filter(([, y]) => y < 50);
    const southern = drawn.filter(([, y]) => y > 50);
    expect(northern.length).toBeGreaterThan(0);
    expect(southern.length).toBeGreaterThan(0);

    // The map-north corner (y = 100) has to land nearer the top of the page.
    const pageYForMapNorth = Math.min(...drawn.map(([, y]) => y));
    const pageYForMapSouth = Math.max(...drawn.map(([, y]) => y));
    expect(pageYForMapNorth).toBeLessThan(pageYForMapSouth);
  });

  it('keeps everything inside the viewBox', () => {
    const shelf = feature([[square(0, 0, 10)], [square(100, 50, 10)]]);
    const drawn = points(outlinePath(shelf, { size: 100, padding: 0.04 }));

    for (const [x, y] of drawn) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it('honours the padding', () => {
    const shelf = feature([[square(0, 0, 10)]]);
    const drawn = points(outlinePath(shelf, { size: 100, padding: 0.2 }));
    const xs = drawn.map(([x]) => x);

    expect(Math.min(...xs)).toBeCloseTo(20, 1);
    expect(Math.max(...xs)).toBeCloseTo(80, 1);
  });

  it('centres the shorter axis in the slack', () => {
    const wide = feature([
      [
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
          [0, 0],
        ],
      ],
    ]);
    const drawn = points(outlinePath(wide, { size: 100, padding: 0 }));
    const ys = drawn.map(([, y]) => y);

    expect(Math.min(...ys)).toBeCloseTo(100 - Math.max(...ys), 1);
  });

  it('scales a small shelf and a large one to the same size', () => {
    // Withholding the scale is the game. Ross is 500,000 km2 and Rydberg
    // Peninsula under 2, and on screen they have to be indistinguishable in
    // size or the puzzle gives itself away.
    const big = feature([[square(0, 0, 1_000_000)]]);
    const small = feature([[square(0, 0, 2000)]]);

    expect(points(outlinePath(big))).toEqual(points(outlinePath(small)));
  });

  it('draws an ice rise as its own subpath', () => {
    // Interior rings are ice rises, and even-odd winding renders them as
    // holes. They are a genuine tell -- Larsen C is partly recognised by its.
    const withRise = feature([[square(0, 0, 100), square(40, 40, 20)]]);
    const path = outlinePath(withRise);

    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/Z/g)).toHaveLength(2);
  });

  it('draws every piece of a fragmented shelf', () => {
    // Wordie is five fragments; drawing only the first would misrepresent it.
    const scattered = feature([
      [square(0, 0, 10)],
      [square(50, 0, 10)],
      [square(100, 0, 10)],
    ]);
    expect(outlinePath(scattered).match(/M/g)).toHaveLength(3);
  });
});
