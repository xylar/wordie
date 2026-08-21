"""Turning the floating-ice mask into polygons.

One connected body of floating ice becomes one polygon, holes and all. What
the holes are is the point: an ice rise is a piece of grounded ice surrounded
by shelf, so it appears in the mask as an enclosed region of non-floating
cells, and keeping it is what makes Larsen C look like Larsen C rather than
like a blob. `rasterio.features.shapes` returns those enclosed regions as
interior rings, so they survive without special handling.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np
from affine import Affine
from numpy.typing import NDArray
from rasterio import features
from shapely.geometry import Polygon, shape

from wordie.projections import area_km2, centroid_lonlat

#: Below this, a polygon is speckle or a drifting berg rather than a shelf:
#: four cells of a 500 m grid. Small enough to keep every named shelf --
#: the smallest in the MEaSUREs boundaries are a few square kilometres -- and
#: large enough to drop the isolated cells a satellite-derived mask always has.
DEFAULT_MIN_AREA_KM2 = 1.0


@dataclass(frozen=True)
class Outline:
    """A connected body of floating ice, in the EPSG:3031 map plane."""

    geometry: Polygon
    area_km2: float
    #: Where the shelf is, as (lon, lat); see `projections.centroid_lonlat`.
    centroid: tuple[float, float]

    @property
    def hole_count(self) -> int:
        """Enclosed ice rises and rock outcrops, as counted by the mask."""
        return len(self.geometry.interiors)


def _drop_small_holes(polygon: Polygon, min_area_m2: float) -> Polygon:
    """Discard interior rings below a threshold, keeping the exterior."""
    if min_area_m2 <= 0.0:
        return polygon
    kept = [
        ring for ring in polygon.interiors if Polygon(ring).area >= min_area_m2
    ]
    if len(kept) == len(polygon.interiors):
        return polygon
    return Polygon(polygon.exterior, kept)


def _raw_polygons(
    mask: NDArray[np.bool_], transform: Affine
) -> Iterator[Polygon]:
    """Yield one polygon per connected region of `mask`.

    The `mask=` argument restricts output to the True cells, so the False
    background does not come back as one enormous polygon of its own.
    """
    for geometry, _value in features.shapes(
        mask.astype(np.uint8), mask=mask, transform=transform
    ):
        polygon = shape(geometry)
        if isinstance(polygon, Polygon):
            yield polygon


def polygonize_floating_ice(
    mask: NDArray[np.bool_],
    transform: Affine,
    min_area_km2: float = DEFAULT_MIN_AREA_KM2,
    min_hole_area_km2: float = 0.0,
) -> list[Outline]:
    """Trace the floating-ice mask into outlines, largest first.

    `min_hole_area_km2` defaults to zero, keeping every ice rise the mask
    resolves; raise it if the speckle of single-cell holes costs more in file
    size than it is worth.
    """
    min_hole_area_m2 = min_hole_area_km2 * 1.0e6
    outlines = []
    for polygon in _raw_polygons(mask, transform):
        polygon = _drop_small_holes(polygon, min_hole_area_m2)
        area = area_km2(polygon)
        if area < min_area_km2:
            continue
        outlines.append(
            Outline(
                geometry=polygon,
                area_km2=area,
                centroid=centroid_lonlat(polygon),
            )
        )
    outlines.sort(key=lambda outline: outline.area_km2, reverse=True)
    return outlines
