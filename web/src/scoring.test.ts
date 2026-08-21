import { describe, expect, it } from 'vitest';
import {
  bearingArrow,
  geodesicDistance,
  mapBearing,
  projectPolarStereographic,
  type LonLat,
} from './scoring';

// Reference values were produced with pyproj (PROJ 9.8.1) transforming
// EPSG:4326 to EPSG:3031, and with pyproj.Geod(ellps='WGS84').inv for the
// geodesics. The audience for this game will check the geometry, so the
// implementations here are pinned against the library they would check it
// with rather than against each other.
const ROSS: LonLat = { lon: -175.0, lat: -78.5 };
const AMERY: LonLat = { lon: 71.0, lat: -69.5 };
const LARSEN_C: LonLat = { lon: -62.5, lat: -67.5 };
const GETZ: LonLat = { lon: -125.0, lat: -74.2 };

describe('projectPolarStereographic', () => {
  it('puts the Greenwich meridian up and 90 east to the right', () => {
    const greenwich = projectPolarStereographic({ lon: 0, lat: -70 });
    expect(greenwich.x).toBeCloseTo(0, 6);
    expect(greenwich.y).toBeCloseTo(2194494.2476, 3);

    const east = projectPolarStereographic({ lon: 90, lat: -70 });
    expect(east.x).toBeCloseTo(2194494.2476, 3);
    expect(east.y).toBeCloseTo(0, 6);
  });

  it('carries the ellipsoidal correction at the standard parallel', () => {
    // At -71 the projection is true, so this radius is a direct check on the
    // isometric-latitude term rather than on the scaling around it.
    const trueScale = projectPolarStereographic({ lon: 0, lat: -71 });
    expect(trueScale.y).toBeCloseTo(2082760.1085, 3);
  });

  it('matches PROJ for points around the continent', () => {
    const cases: [LonLat, number, number][] = [
      [AMERY, 2127874.8766, 732686.0776],
      [ROSS, -109253.6645, -1248775.0998],
      [LARSEN_C, -2195634.9904, 1142975.2311],
      [GETZ, -1414864.8744, -990699.0506],
      [{ lon: 180, lat: -75 }, 0, -1638783.2384],
    ];
    for (const [point, x, y] of cases) {
      const projected = projectPolarStereographic(point);
      expect(projected.x).toBeCloseTo(x, 3);
      expect(projected.y).toBeCloseTo(y, 3);
    }
  });
});

describe('geodesicDistance', () => {
  it('matches pyproj.Geod on WGS 84', () => {
    expect(geodesicDistance(ROSS, AMERY)).toBeCloseTo(3036320.1121, 3);
    expect(geodesicDistance(LARSEN_C, GETZ)).toBeCloseTo(2281117.4889, 3);
    expect(geodesicDistance(ROSS, LARSEN_C)).toBeCloseTo(3217768.7568, 3);
  });

  it('is symmetric and zero for a point against itself', () => {
    expect(geodesicDistance(AMERY, AMERY)).toBe(0);
    expect(geodesicDistance(ROSS, GETZ)).toBeCloseTo(
      geodesicDistance(GETZ, ROSS),
      6,
    );
  });
});

describe('mapBearing', () => {
  it('points the way the map does, not the way the great circle does', () => {
    // The case the whole convention exists for. Amery sits up and to the
    // right of Ross on any map of Antarctica, but the great circle between
    // them passes close to the South Pole, so pyproj.Geod gives an initial
    // bearing of 224.4 degrees -- southwest. The player is reading a map.
    expect(mapBearing(ROSS, AMERY)).toBeCloseTo(48.5, 1);
  });

  it('is measured clockwise from map-up', () => {
    const pole: LonLat = { lon: 0, lat: -90 };
    expect(mapBearing(pole, { lon: 0, lat: -70 })).toBeCloseTo(0, 6);
    expect(mapBearing(pole, { lon: 90, lat: -70 })).toBeCloseTo(90, 6);
    expect(mapBearing(pole, { lon: 180, lat: -70 })).toBeCloseTo(180, 6);
    expect(mapBearing(pole, { lon: -90, lat: -70 })).toBeCloseTo(270, 6);
  });

  it('reverses when the endpoints swap', () => {
    const there = mapBearing(LARSEN_C, GETZ);
    const back = mapBearing(GETZ, LARSEN_C);
    expect((there + 180) % 360).toBeCloseTo(back, 6);
  });

  it('is zero for a shelf against itself', () => {
    expect(mapBearing(AMERY, AMERY)).toBe(0);
  });
});

describe('bearingArrow', () => {
  it('rounds to the nearest of eight points', () => {
    expect(bearingArrow(0)).toBe('⬆️');
    expect(bearingArrow(22)).toBe('⬆️');
    expect(bearingArrow(23)).toBe('↗️');
    expect(bearingArrow(90)).toBe('➡️');
    expect(bearingArrow(180)).toBe('⬇️');
    expect(bearingArrow(270)).toBe('⬅️');
  });

  it('wraps rather than falling off the end', () => {
    expect(bearingArrow(359)).toBe('⬆️');
    expect(bearingArrow(360)).toBe('⬆️');
    expect(bearingArrow(-90)).toBe('⬅️');
  });
});
