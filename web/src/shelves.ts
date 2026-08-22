/**
 * Loading the ice shelf outlines and turning one into something drawable.
 *
 * The file is a FeatureCollection, but its geometry is in EPSG:3031 metres
 * rather than degrees -- see `payload.py` for why. That is the projection the
 * game draws in, so the coordinates arrive ready to scale and need no
 * reprojection here.
 *
 * Every shelf is drawn alone and scaled to fill the same box, which is what
 * withholds the scale from the player: Ross covers 500,000 km2 and Rydberg
 * Peninsula under 2, and on screen they are the same size. Only the shape and
 * its orientation survive that, and both are kept exactly.
 */

// eslint-disable-next-line -- Vite resolves this to a content-hashed URL.
import shelvesUrl from './data/shelves.geojson?url';

export interface ShelfProperties {
  /** Stable identifier, the dataset's own spelling: 'LarsenC'. */
  key: string;
  /** What the player reads: 'Larsen C'. */
  name: string;
  area_km2: number;
  /** Centroid in degrees, for scoring a guess. */
  lon: number;
  lat: number;
}

export interface ShelfFeature {
  type: 'Feature';
  properties: ShelfProperties;
  geometry: {
    type: 'MultiPolygon';
    /** [polygon][ring][point][x, y], in EPSG:3031 metres. */
    coordinates: number[][][][];
  };
}

/** One of the datasets the outlines are derived from. */
export interface Source {
  role: string;
  title: string;
  citation: string;
  doi: string;
  reference: string;
}

export interface ShelfCollection {
  type: 'FeatureCollection';
  crs: string;
  /** Why this file is not the source data. */
  note: string;
  sources: Source[];
  features: ShelfFeature[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How an outline is fitted into its box. */
export interface OutlineOptions {
  /** Side of the square viewBox the path is drawn into. */
  size: number;
  /** Clear space around the shape, as a fraction of the side. */
  padding: number;
  /** Round the corners the raster left behind. */
  smoothed: boolean;
}

export const DEFAULT_OUTLINE_OPTIONS: OutlineOptions = {
  size: 100,
  padding: 0.04,
  smoothed: true,
};

const rings = (feature: ShelfFeature): number[][][] =>
  feature.geometry.coordinates.flat();

export const boundsOf = (feature: ShelfFeature): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of rings(feature)) {
    for (const point of ring) {
      const x = point[0];
      const y = point[1];
      if (x === undefined || y === undefined) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!(maxX > minX && maxY > minY)) {
    throw new Error(`shelf ${feature.properties.key} has no extent to draw`);
  }
  return { minX, minY, maxX, maxY };
};

/**
 * An SVG path for one shelf, fitted to a square viewBox.
 *
 * The aspect ratio is preserved. Stretching a shelf to fill the box would be
 * a lie about its outline, and the players this is for compare shapes for a
 * living. The shorter axis is centred in the slack instead.
 */
const format = (point: [number, number]): string =>
  `${point[0].toFixed(2)},${point[1].toFixed(2)}`;

const midpoint = (
  a: [number, number],
  b: [number, number],
): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const straightRing = (points: [number, number][]): string =>
  points.length > 0 ? `M${points.map(format).join('L')}Z` : '';

/**
 * A ring drawn as quadratic curves rather than straight segments.
 *
 * Each stored vertex becomes a control point and each edge midpoint an
 * on-curve point, which is the limit a Chaikin corner-cut converges to -- so
 * this is the same smoothing, done by the renderer for nothing rather than
 * baked into the file at three times the size.
 *
 * It matters because the outlines are traced from a 500 m raster. The
 * pipeline decimates the staircase away and leaves a polygon whose corners
 * are the shelf's own; this rounds those corners, and the result reads as a
 * coastline instead of a cutting.
 */
const quadraticRing = (points: [number, number][]): string => {
  const ring =
    points.length > 1 &&
    points[0]?.[0] === points[points.length - 1]?.[0] &&
    points[0]?.[1] === points[points.length - 1]?.[1]
      ? points.slice(0, -1)
      : points;

  // Below a triangle there is no corner to round, and the curve would be
  // degenerate; draw what little there is straight.
  if (ring.length < 3) return straightRing(points);

  const last = ring[ring.length - 1] as [number, number];
  const first = ring[0] as [number, number];
  const segments = [`M${format(midpoint(last, first))}`];
  for (let i = 0; i < ring.length; i += 1) {
    const control = ring[i] as [number, number];
    const next = ring[(i + 1) % ring.length] as [number, number];
    segments.push(`Q${format(control)} ${format(midpoint(control, next))}`);
  }
  return `${segments.join('')}Z`;
};

export const outlinePath = (
  feature: ShelfFeature,
  options: OutlineOptions = DEFAULT_OUTLINE_OPTIONS,
): string => {
  const { size, padding, smoothed } = options;
  const { minX, minY, maxX, maxY } = boundsOf(feature);

  const usable = size * (1 - 2 * padding);
  const scale = usable / Math.max(maxX - minX, maxY - minY);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxY - minY) * scale) / 2;

  const parts: string[] = [];
  for (const ring of rings(feature)) {
    const points: [number, number][] = [];
    for (const point of ring) {
      const x = point[0];
      const y = point[1];
      if (x === undefined || y === undefined) continue;
      // SVG's y axis runs down the page and the map's runs north, so y is
      // flipped. Without it every shelf is drawn upside down, which on
      // outlines this irregular is not obvious until one sits beside a map.
      points.push([
        offsetX + (x - minX) * scale,
        size - (offsetY + (y - minY) * scale),
      ]);
    }
    const path = smoothed ? quadraticRing(points) : straightRing(points);
    if (path) parts.push(path);
  }
  return parts.join('');
};

/**
 * Fetch the outlines.
 *
 * The URL comes from importing the file rather than being written out, so the
 * build gives it a content hash. Served from `public/` it had a fixed name,
 * and a returning player kept whatever their browser had cached -- which is
 * how a fortnight of outline fixes reached the deployed site and not the
 * people looking at it.
 */
export const loadCollection = async (
  url: string = shelvesUrl,
): Promise<ShelfCollection> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not load the ice shelves: ${response.status}`);
  }
  return (await response.json()) as ShelfCollection;
};

export const loadShelves = async (
  url: string = shelvesUrl,
): Promise<ShelfFeature[]> => (await loadCollection(url)).features;
