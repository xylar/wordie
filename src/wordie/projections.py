"""The coordinate systems the pipeline works in, and why each is used.

Three of them, each doing a job the others would do badly.
"""

from __future__ import annotations

from pyproj import CRS, Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as transform_geometry

# BedMachine's own grid, and the plane the game draws in. Bearings shown to the
# player are measured here, so centroids are taken here too: the arrow and the
# point it sets out from then agree by construction rather than by luck.
MAP_CRS = CRS.from_epsg(3031)

# Longitude and latitude, for anything leaving the pipeline. The game scores a
# guess with a geodesic, which needs geographic coordinates.
GEOGRAPHIC_CRS = CRS.from_epsg(4326)

# Areas are measured here rather than in EPSG:3031. Polar stereographic is
# conformal, not equal-area: its scale is true only at 71 S and departs from
# there in both directions, so planar areas would be wrong by several percent
# -- and wrong the opposite way for Ross than for the Peninsula, which is the
# kind of error that survives review because no single number looks absurd.
# Lambert azimuthal equal-area on the same pole has no such bias, and being
# azimuthal it has no antimeridian for the Ross Ice Shelf to straddle.
AREA_CRS = CRS.from_proj4(
    '+proj=laea +lat_0=-90 +lon_0=0 +datum=WGS84 +units=m +no_defs'
)

# Building a Transformer is not cheap and the pipeline converts every polygon
# it finds, so they are made once here rather than per call.
_TO_GEOGRAPHIC = Transformer.from_crs(MAP_CRS, GEOGRAPHIC_CRS, always_xy=True)
_TO_EQUAL_AREA = Transformer.from_crs(MAP_CRS, AREA_CRS, always_xy=True)


def to_geographic(geometry: BaseGeometry) -> BaseGeometry:
    """Reproject a map-plane geometry to longitude and latitude."""
    return transform_geometry(_TO_GEOGRAPHIC.transform, geometry)


def to_equal_area(geometry: BaseGeometry) -> BaseGeometry:
    """Reproject a map-plane geometry to the equal-area projection."""
    return transform_geometry(_TO_EQUAL_AREA.transform, geometry)


def area_km2(geometry: BaseGeometry) -> float:
    """True area of a map-plane geometry, in square kilometres."""
    return float(to_equal_area(geometry).area) / 1.0e6


def centroid_lonlat(geometry: BaseGeometry) -> tuple[float, float]:
    """Area-weighted centroid of a map-plane geometry, as (lon, lat).

    Taken in the map plane, not on the ellipsoid, because this point is what
    the game measures bearings from and bearings are map-plane too. For a
    strongly curved shelf such as George VI the centroid can fall outside the
    shelf itself; that is correct for the purpose it serves here, which is to
    say where the shelf is rather than to name a spot on it.
    """
    centroid = geometry.centroid
    lon, lat = _TO_GEOGRAPHIC.transform(centroid.x, centroid.y)
    return float(lon), float(lat)
