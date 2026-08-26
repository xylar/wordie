import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  contextPaths,
  outlinePath,
  type ShelfContext,
  type ShelfFeature,
} from './shelves';

const feature = (
  coordinates: number[][][][],
  context?: ShelfContext,
): ShelfFeature => ({
  type: 'Feature',
  properties: {
    key: 'Test',
    name: 'Test',
    area_km2: 1,
    lon: 0,
    lat: -70,
    ...(context ? { context } : {}),
  },
  geometry: { type: 'MultiPolygon', coordinates },
});

const square = (x0: number, y0: number, size: number): number[][] => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
];

const STRAIGHT = { size: 100, padding: 0.04, smoothed: false };

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
    const drawn = points(outlinePath(wide, STRAIGHT));

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
    const drawn = points(outlinePath(tall, STRAIGHT));

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
    const drawn = points(
      outlinePath(shelf, { size: 100, padding: 0.04, smoothed: false }),
    );

    for (const [x, y] of drawn) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it('honours the padding', () => {
    const shelf = feature([[square(0, 0, 10)]]);
    const drawn = points(
      outlinePath(shelf, { size: 100, padding: 0.2, smoothed: false }),
    );
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
    const drawn = points(
      outlinePath(wide, { size: 100, padding: 0, smoothed: false }),
    );
    const ys = drawn.map(([, y]) => y);

    expect(Math.min(...ys)).toBeCloseTo(100 - Math.max(...ys), 1);
  });

  it('scales a small shelf and a large one to the same size', () => {
    // Withholding the scale is the game. Ross is 500,000 km2 and Rydberg
    // Peninsula under 2, and on screen they have to be indistinguishable in
    // size or the puzzle gives itself away.
    const big = feature([[square(0, 0, 1_000_000)]]);
    const small = feature([[square(0, 0, 2000)]]);

    expect(points(outlinePath(big, STRAIGHT))).toEqual(
      points(outlinePath(small, STRAIGHT)),
    );
  });

  it('draws an ice rise as its own subpath', () => {
    // Interior rings are ice rises, and even-odd winding renders them as
    // holes. They are a genuine tell -- Larsen C is partly recognised by its.
    const withRise = feature([[square(0, 0, 100), square(40, 40, 20)]]);
    const path = outlinePath(withRise, STRAIGHT);

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
    expect(outlinePath(scattered, STRAIGHT).match(/M/g)).toHaveLength(3);
  });
});

describe('smoothing', () => {
  const stepped = feature([
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [20, 10],
        [20, 20],
        [30, 20],
        [30, 30],
        [30, 0],
        [0, 0],
      ],
    ],
  ]);

  it('draws curves rather than straight segments by default', () => {
    // The outlines are traced from a 500 m raster, so their corners are the
    // grid's as much as the shelf's. Rounding them at render costs nothing
    // and is the same smoothing a Chaikin corner-cut converges to.
    const path = outlinePath(stepped);
    expect(path).toContain('Q');
    expect(path).not.toContain('L');
  });

  it('can be turned off', () => {
    const path = outlinePath(stepped, STRAIGHT);
    expect(path).toContain('L');
    expect(path).not.toContain('Q');
  });

  it('closes the ring', () => {
    expect(outlinePath(stepped).endsWith('Z')).toBe(true);
  });

  it('starts on the curve, not on a corner', () => {
    // The first point has to be a midpoint; starting at a vertex would leave
    // that one corner unrounded and visibly sharper than its neighbours.
    const path = outlinePath(stepped);
    const start = path.slice(1, path.indexOf('Q'));
    const [x, y] = start.split(',').map(Number);
    const corners = points(outlinePath(stepped, STRAIGHT));
    for (const [cx, cy] of corners) {
      expect(Math.hypot((x ?? 0) - cx, (y ?? 0) - cy)).toBeGreaterThan(1e-9);
    }
  });

  it('stays inside the viewBox', () => {
    // Quadratic curves lie within the convex hull of their control points, so
    // a path that starts inside the box cannot leave it.
    for (const [x, y] of points(outlinePath(stepped))) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it('survives a ring too small to have a corner', () => {
    // A two-point ring has no corner to round and would make a degenerate
    // curve. It should be drawn straight rather than break the shelf it
    // belongs to.
    const withSliver = feature([
      [square(0, 0, 100)],
      [
        [
          [5, 5],
          [6, 6],
          [5, 5],
        ],
      ],
    ]);
    const path = outlinePath(withSliver);

    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).toContain('Q');
  });

  it('still draws every piece and every hole', () => {
    const withRise = feature([[square(0, 0, 100), square(40, 40, 20)]]);
    expect(outlinePath(withRise).match(/M/g)).toHaveLength(2);
    expect(outlinePath(withRise).match(/Z/g)).toHaveLength(2);
  });
});

describe('contextPaths', () => {
  const box = (x0: number, y0: number, size: number): number[][] => [
    [x0, y0],
    [x0 + size, y0],
    [x0 + size, y0 + size],
    [x0, y0 + size],
    [x0, y0],
  ];
  const shelf = box(0, 0, 100);

  it('says nothing about a shelf with no surroundings in the file', () => {
    // A payload built without the mask carries none, and the game has to go
    // on drawing the outline as it always did.
    expect(contextPaths(feature([[shelf]]))).toEqual({ land: '', ice: '' });
  });

  it('scales the surroundings by the shelf, not by themselves', () => {
    // The land reaches past the frame on every side. Fitting the drawing to
    // it instead of to the shelf would shrink every shelf to make room for
    // its own scenery, and the whole game is one shelf at one size.
    const alone = feature([[shelf]]);
    const surrounded = feature([[shelf]], {
      land: [[box(-200, -200, 500)]],
      ice: [],
    });

    expect(outlinePath(surrounded)).toBe(outlinePath(alone));
  });

  it('draws the land past the edge of the box', () => {
    const surrounded = feature([[shelf]], {
      land: [[box(-200, -200, 500)]],
      ice: [],
    });

    const drawn = points(contextPaths(surrounded).land);
    const xs = drawn.map(([x]) => x);

    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(100);
  });

  it('keeps each layer to its own path', () => {
    const surrounded = feature([[shelf]], {
      land: [[box(-200, -200, 120)]],
      ice: [[box(150, 150, 60)]],
    });
    const drawn = contextPaths(surrounded);

    expect(drawn.land).not.toBe('');
    expect(drawn.ice).not.toBe('');
    expect(drawn.land).not.toBe(drawn.ice);
  });

  it('gives every ring of a layer to one path, holes included', () => {
    // One path per layer is what lets evenodd cut a lake out of the ice
    // sheet; two paths would fill the hole in with the second one.
    const surrounded = feature([[shelf]], {
      land: [[box(-200, -200, 500), box(-100, -100, 50)]],
      ice: [],
    });

    expect(contextPaths(surrounded).land.split('M')).toHaveLength(3);
  });
});
