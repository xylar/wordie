"""Derive Antarctic ice shelf outlines from published datasets.

The shapes the game draws are not traced by hand. They come from the
floating-ice mask of MEaSUREs BedMachine Antarctica, and the names attached to
them come from the MEaSUREs Antarctic Boundaries polygons. Everything in this
package exists to get from those two files to a small file the browser can
load, without a step that a reader could not repeat.
"""

from wordie.bedmachine import FLOATING_ICE, read_floating_mask
from wordie.outlines import Outline, polygonize_floating_ice
from wordie.projections import area_km2, centroid_lonlat

__all__ = [
    'FLOATING_ICE',
    'Outline',
    'area_km2',
    'centroid_lonlat',
    'polygonize_floating_ice',
    'read_floating_mask',
]
