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

export interface ShelfCollection {
  type: 'FeatureCollection';
  crs: string;
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
}

export const DEFAULT_OUTLINE_OPTIONS: OutlineOptions = {
  size: 100,
  padding: 0.04,
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
export const outlinePath = (
  feature: ShelfFeature,
  options: OutlineOptions = DEFAULT_OUTLINE_OPTIONS,
): string => {
  const { size, padding } = options;
  const { minX, minY, maxX, maxY } = boundsOf(feature);

  const usable = size * (1 - 2 * padding);
  const scale = usable / Math.max(maxX - minX, maxY - minY);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxY - minY) * scale) / 2;

  const parts: string[] = [];
  for (const ring of rings(feature)) {
    const points: string[] = [];
    for (const point of ring) {
      const x = point[0];
      const y = point[1];
      if (x === undefined || y === undefined) continue;
      // SVG's y axis runs down the page and the map's runs north, so y is
      // flipped. Without it every shelf is drawn upside down, which on
      // outlines this irregular is not obvious until one sits beside a map.
      const px = offsetX + (x - minX) * scale;
      const py = size - (offsetY + (y - minY) * scale);
      points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
    }
    if (points.length > 0) {
      parts.push(`M${points.join('L')}Z`);
    }
  }
  return parts.join('');
};

/** Fetch the outlines, relative to wherever the game is deployed. */
export const loadShelves = async (
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<ShelfFeature[]> => {
  const response = await fetch(`${baseUrl}data/shelves.geojson`);
  if (!response.ok) {
    throw new Error(`could not load the ice shelves: ${response.status}`);
  }
  const collection = (await response.json()) as ShelfCollection;
  return collection.features;
};
