/**
 * Scoring a guess: how far the guessed ice shelf is from the answer, and which
 * way the player should look.
 *
 * The two halves use different geometry on purpose. Distance is a true
 * geodesic on the WGS 84 ellipsoid, because that is the number a glaciologist
 * would quote. Direction is a bearing in the map plane of the Antarctic Polar
 * Stereographic projection (EPSG:3031), because that is the picture the player
 * is holding in their head. On a continent draped over a pole the two
 * disagree sharply -- the great circle from Ross to Amery passes close to the
 * South Pole, so its initial bearing reads as "south" even though Amery lies
 * at a lower latitude -- and following the true bearing would send the player
 * the wrong way across their own mental map.
 */

export interface LonLat {
  /** Degrees east, in [-180, 180]. */
  lon: number;
  /** Degrees north; negative throughout Antarctica. */
  lat: number;
}

/** A point in the EPSG:3031 map plane, in metres from the South Pole. */
export interface Projected {
  x: number;
  y: number;
}

// WGS 84.
const SEMI_MAJOR_M = 6378137.0;
const FLATTENING = 1 / 298.257223563;
const SEMI_MINOR_M = SEMI_MAJOR_M * (1 - FLATTENING);
const ECCENTRICITY = Math.sqrt(FLATTENING * (2 - FLATTENING));

// EPSG:3031: latitude of true scale -71, central meridian 0, no false
// easting or northing.
const TRUE_SCALE_LAT_DEG = -71;
const CENTRAL_MERIDIAN_DEG = 0;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Snyder's isometric-latitude term `t` for the southern aspect, which carries
 * the ellipsoidal correction that a spherical projection would drop. At the
 * South Pole it is 0 and it grows towards the equator.
 */
const isometricT = (latRad: number): number => {
  const eSinLat = ECCENTRICITY * Math.sin(latRad);
  return (
    Math.tan(Math.PI / 4 + latRad / 2) /
    Math.pow((1 + eSinLat) / (1 - eSinLat), ECCENTRICITY / 2)
  );
};

/**
 * Project to the EPSG:3031 map plane, where +y runs along the Greenwich
 * meridian and +x along 90 degrees east -- the orientation of every standard
 * map of Antarctica, with the Weddell Sea upper left and the Ross Sea below.
 */
export const projectPolarStereographic = (point: LonLat): Projected => {
  const latRad = toRadians(point.lat);
  const trueScaleLatRad = toRadians(TRUE_SCALE_LAT_DEG);
  const eSinTrueScale = ECCENTRICITY * Math.sin(trueScaleLatRad);

  // Scale factor at the standard parallel, where the projection is true.
  const mTrueScale =
    Math.cos(trueScaleLatRad) / Math.sqrt(1 - eSinTrueScale * eSinTrueScale);

  const radius =
    (SEMI_MAJOR_M * mTrueScale * isometricT(latRad)) /
    isometricT(trueScaleLatRad);

  const lonRad = toRadians(point.lon - CENTRAL_MERIDIAN_DEG);
  return { x: radius * Math.sin(lonRad), y: radius * Math.cos(lonRad) };
};

/**
 * Bearing from one point to another as drawn on an EPSG:3031 map, in degrees
 * clockwise from map-up. Returns 0 when the two points project to the same
 * place, which in practice means a shelf compared with itself.
 */
export const mapBearing = (from: LonLat, to: LonLat): number => {
  const a = projectPolarStereographic(from);
  const b = projectPolarStereographic(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  // atan2(dx, dy) rather than the usual atan2(dy, dx): the angle is measured
  // clockwise from +y, not counterclockwise from +x.
  return (toDegrees(Math.atan2(dx, dy)) + 360) % 360;
};

const COMPASS_POINTS = [
  '⬆️',
  '↗️',
  '➡️',
  '↘️',
  '⬇️',
  '↙️',
  '⬅️',
  '↖️',
] as const;

/** The eight-point arrow nearest a bearing, for the guess row. */
export const bearingArrow = (bearingDeg: number): string => {
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  // `noUncheckedIndexedAccess` is on and the modulo is not visible to the
  // compiler, so the fallback stands in for an index it cannot prove is safe.
  return COMPASS_POINTS[index] ?? '⬆️';
};

/**
 * Geodesic distance in metres on WGS 84, by Vincenty's inverse method.
 *
 * Vincenty is slow to converge for near-antipodal points, but no two points in
 * Antarctica are anywhere near antipodal, so the iteration always terminates
 * quickly here. The loop is bounded anyway rather than trusted.
 */
export const geodesicDistance = (from: LonLat, to: LonLat): number => {
  const reducedLat1 = Math.atan(
    (1 - FLATTENING) * Math.tan(toRadians(from.lat)),
  );
  const reducedLat2 = Math.atan((1 - FLATTENING) * Math.tan(toRadians(to.lat)));
  const deltaLon = toRadians(to.lon - from.lon);

  const sinU1 = Math.sin(reducedLat1);
  const cosU1 = Math.cos(reducedLat1);
  const sinU2 = Math.sin(reducedLat2);
  const cosU2 = Math.cos(reducedLat2);

  // Longitude difference on the auxiliary sphere; the iteration refines it.
  let lambda = deltaLon;
  let sinSigma = 0;
  let cosSigma = 1;
  let sigma = 0;
  let cosSqAlpha = 1;
  let cos2SigmaM = 1;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    // Coincident points: the formulae below divide by sinSigma.
    if (sinSigma === 0) return 0;

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);

    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // Zero on an equatorial line, where the cosine below is undefined; Snyder's
    // convention is to set it to zero and carry on.
    cos2SigmaM =
      cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

    const c =
      (FLATTENING / 16) * cosSqAlpha * (4 + FLATTENING * (4 - 3 * cosSqAlpha));
    const previousLambda = lambda;
    lambda =
      deltaLon +
      (1 - c) *
        FLATTENING *
        sinAlpha *
        (sigma +
          c *
            sinSigma *
            (cos2SigmaM + c * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - previousLambda) < 1e-12) break;
  }

  const uSq =
    (cosSqAlpha * (SEMI_MAJOR_M ** 2 - SEMI_MINOR_M ** 2)) / SEMI_MINOR_M ** 2;
  const a = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const b = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    b *
    sinSigma *
    (cos2SigmaM +
      (b / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (b / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return SEMI_MINOR_M * a * (sigma - deltaSigma);
};
