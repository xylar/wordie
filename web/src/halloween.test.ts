import { describe, expect, it } from 'vitest';
import { HALLOWEEN_KEY, halloweenShelf, isHalloween } from './halloween';
import { answerPool } from './pool';
import type { ShelfCollection, ShelfFeature } from './shelves';
// The file the game ships, read through Vite the way the game reads it rather
// than through the filesystem, so this cannot pass against a copy the build
// would never serve.
import shelvesJson from './data/shelves.geojson?raw';

const shelf = (key: string, area: number): ShelfFeature => ({
  type: 'Feature',
  properties: { key, name: key, area_km2: area, lon: 0, lat: -70 },
  geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0]]]] },
});

const POOL = [shelf('Ross', 500_000), shelf(HALLOWEEN_KEY, 10_509)];
const HALLOWEEN = new Date(Date.UTC(2026, 9, 31));

describe('isHalloween', () => {
  it('is 31 October and nothing else', () => {
    expect(isHalloween(HALLOWEEN)).toBe(true);
    expect(isHalloween(new Date(Date.UTC(2026, 9, 30)))).toBe(false);
    expect(isHalloween(new Date(Date.UTC(2026, 10, 1)))).toBe(false);
    // The month is zero-based, and 31 October read as November would be a
    // bug that only shows up one day a year.
    expect(isHalloween(new Date(Date.UTC(2026, 10, 31)))).toBe(false);
  });

  it('goes by the UTC day, as the puzzle number does', () => {
    // Late on Halloween in London is still Halloween; half an hour later it
    // is not, even though most of the Americas would say it still is. The
    // shelf has to change for everyone at the same instant or the shared
    // grid stops meaning anything.
    expect(isHalloween(new Date('2026-10-31T23:30:00Z'))).toBe(true);
    expect(isHalloween(new Date('2026-11-01T00:30:00Z'))).toBe(false);
    expect(isHalloween(new Date('2026-10-31T00:30:00Z'))).toBe(true);
  });

  it('finds it in any year', () => {
    expect(isHalloween(new Date(Date.UTC(2031, 9, 31)))).toBe(true);
  });
});

describe('the Halloween shelf', () => {
  it('is the ghost, on the day', () => {
    expect(halloweenShelf(POOL, HALLOWEEN)?.properties.key).toBe(HALLOWEEN_KEY);
  });

  it('is nothing on any other day', () => {
    expect(
      halloweenShelf(POOL, new Date(Date.UTC(2026, 9, 30))),
    ).toBeUndefined();
  });

  it('is nothing when the pool has no ghost in it', () => {
    // A future mask that renames or drops Wilkins costs the joke and not the
    // day's puzzle.
    expect(halloweenShelf([shelf('Ross', 500_000)], HALLOWEEN)).toBeUndefined();
  });
});

describe('the shelves the game ships with', () => {
  it('has a ghost in the everyday pool for Halloween to find', () => {
    // The joke depends on Wilkins being one of the shelves the daily puzzle
    // can draw from, which it is by area -- nineteenth largest of the 164.
    // If a new version of the mask changed that, the fallback would quietly
    // swallow it, so it is checked against the file that is actually shipped.
    const collection = JSON.parse(shelvesJson) as ShelfCollection;
    const pool = answerPool(collection.features, 'major');
    expect(pool.map((shelf) => shelf.properties.key)).toContain(HALLOWEEN_KEY);
  });
});
