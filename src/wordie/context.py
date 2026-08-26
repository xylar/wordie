"""What is around an ice shelf: the land it is pinned to, the sea it calves
into, and the shelves it shares a body of ice with.

The outline alone withholds the thing a glaciologist reads a shelf by. Which
of its edges is the calving front and which is the grounding line is most of
the recognition -- Ross is a blunt front across the bottom of a coast that
wraps round everything else, Amery is a tongue gripped down both sides -- and
an outline drawn alone in an empty box says neither.

BedMachine already knows. The pipeline traces one of its five mask values and
has no use for the rest; but `ocean`, `ice_free_land`, `grounded_ice` and
`lake_vostok` are exactly the surroundings, on the same grid as the shape they
surround. So this takes a square of the mask around each shelf and turns the
other classes into polygons of their own: land, meaning anything sitting on
rock, and ice, meaning floating ice that is not this shelf.

Open water is not among them, and deliberately. It is what is left over, and
the game draws it as the page's own ground -- which is already the colour of
deep water, and costs nothing to ship.

Coarser than the outlines, and for a reason. The outline is the puzzle and is
kept to half a pixel; this is the setting it sits in, where a coastline two
pixels out of place is a coastline nobody measures. That difference is most of
what keeps the file the size it was.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from affine import Affine
from numpy.typing import NDArray
from rasterio import features
from shapely.geometry import LinearRing, MultiPolygon, Polygon, box, shape
from shapely.geometry.base import BaseGeometry

#: Mask values that mean ice or rock resting on the bed rather than floating.
#:
#: Lake Vostok is in here because it is the odd one out of the five: a lake
#: under the ice sheet, thousands of kilometres from any shelf. It will never
#: be in shot, and calling it land is the answer that needs no exception.
LAND_VALUES = (1, 2, 4)

#: Floating ice, the value the outlines themselves are traced from.
FLOATING_VALUE = 3

#: The side of the square of surroundings, in units of the shelf's longest
#: side.
#:
#: The game fits a shelf into its frame with a 4% margin all round, so 1.087
#: of the longest side is exactly what shows. This is a little wider than
#: that: the surroundings then run past the edge of the frame and are clipped
#: by it, rather than stopping just inside it and leaving a bare corner if the
#: margin is ever widened.
BOX_FRACTION = 1.15

#: Simplification of the surroundings, as a fraction of the shelf's extent.
#:
#: Two pixels of the 500 the game draws a shelf at, against a twentieth of a
#: pixel for the outline itself. The outline is what the player is being asked
#: to recognise and the surroundings are context: a headland fifty kilometres
#: inland is doing its work at a glance or not at all. Over 164 shelves this
#: costs 20,000 vertices where half a pixel would have cost 29,000, which is
#: the whole of the outlines again.
DEFAULT_CONTEXT_FRACTION = 0.004

#: Drop a piece of surroundings whose area is below this fraction of the
#: shelf's extent, squared -- so, a piece under about six pixels across.
#:
#: The coast off a shelf front is speckled with rocks and grounded bergs one
#: or two cells across. Drawn, they are dirt on the screen; counted, they are
#: a third of the vertices in the file.
DEFAULT_MIN_PIECE_FRACTION = 0.012


def polygons_of(geometry: BaseGeometry) -> list[Polygon]:
    """The parts of a shelf, whether or not it comes in more than one piece."""
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, Polygon):
        return [geometry]
    raise TypeError(f'cannot walk the rings of a {geometry.geom_type}')


def rings_of(polygon: Polygon) -> list[LinearRing]:
    """Exterior first, then the ice rises, in the order the payload writes."""
    return [polygon.exterior, *polygon.interiors]


def context_box(
    geometry: BaseGeometry, fraction: float = BOX_FRACTION
) -> Polygon:
    """The square of the world the game will draw around this shelf.

    Square, and sized from the longer side, because that is how the shelf is
    fitted into the frame: a long thin shelf is scaled to its length and the
    slack falls above and below it, so the surroundings have to reach as far
    across the short axis as the long one.
    """
    min_x, min_y, max_x, max_y = geometry.bounds
    half = fraction * max(max_x - min_x, max_y - min_y) / 2.0
    centre_x = (min_x + max_x) / 2.0
    centre_y = (min_y + max_y) / 2.0
    return box(
        centre_x - half, centre_y - half, centre_x + half, centre_y + half
    )


@dataclass(frozen=True)
class Surroundings:
    """What lies around one shelf, in the EPSG:3031 map plane."""

    #: Grounded ice, ice-free land and Lake Vostok, as the mask has them.
    land: list[Polygon]
    #: Floating ice that is not this shelf: its neighbours across a cut.
    ice: list[Polygon]

    @property
    def vertex_count(self) -> int:
        return sum(
            len(ring.coords)
            for polygon in [*self.land, *self.ice]
            for ring in rings_of(polygon)
        )


@dataclass(frozen=True)
class MaskGrid:
    """BedMachine's mask, still on its own grid.

    The pipeline reads the mask once and traces floating ice out of it; this
    keeps the rest, which is everything the shelf is surrounded by.
    """

    values: NDArray[np.int8]
    transform: Affine

    @property
    def cell(self) -> float:
        """The grid spacing in metres, taken from the file, not assumed."""
        return abs(self.transform.a)

    def window(
        self, bounds: tuple[float, float, float, float]
    ) -> tuple[NDArray[np.int8], Affine]:
        """The part of the grid covering `bounds`, and where it sits.

        A view rather than a copy, and one cell of slack on every side so that
        a region running up to the edge of the box is traced against what is
        actually beyond it rather than against the end of the array. The whole
        mask is 13,333 cells square; polygonising it for every one of 164
        shelves would be most of a minute per shelf for scenery that is
        thrown away.
        """
        min_x, min_y, max_x, max_y = bounds
        columns, rows = ~self.transform * (
            np.array([min_x, max_x, min_x, max_x]),
            np.array([min_y, min_y, max_y, max_y]),
        )
        height, width = self.values.shape
        first_column = max(0, int(np.floor(columns.min())) - 1)
        last_column = min(width, int(np.ceil(columns.max())) + 1)
        first_row = max(0, int(np.floor(rows.min())) - 1)
        last_row = min(height, int(np.ceil(rows.max())) + 1)
        return (
            self.values[first_row:last_row, first_column:last_column],
            self.transform * Affine.translation(first_column, first_row),
        )

    def surroundings(
        self,
        geometry: BaseGeometry,
        fraction: float = DEFAULT_CONTEXT_FRACTION,
        min_piece_fraction: float = DEFAULT_MIN_PIECE_FRACTION,
        box_fraction: float = BOX_FRACTION,
    ) -> Surroundings:
        """Trace what surrounds one shelf, ready to draw."""
        clip = context_box(geometry, box_fraction)
        values, transform = self.window(clip.bounds)
        extent = max(
            geometry.bounds[2] - geometry.bounds[0],
            geometry.bounds[3] - geometry.bounds[1],
        )
        # Never finer than a cell: below that there is no coastline left to
        # keep, only the staircase the grid traced.
        tolerance = max(fraction * extent, self.cell)
        min_area = (min_piece_fraction * extent) ** 2

        return Surroundings(
            land=_trace(
                values,
                transform,
                np.isin(values, LAND_VALUES),
                clip,
                tolerance,
                min_area,
            ),
            ice=_trace(
                values,
                transform,
                values == FLOATING_VALUE,
                clip,
                tolerance,
                min_area,
                # This shelf is floating ice too, and in the middle of the
                # frame. Taking it out leaves its neighbours, which is what
                # this layer is for -- and takes with it a second copy of the
                # outline, drawn underneath the real one where nobody would
                # ever see it.
                minus=geometry,
            ),
        )


def _trace(
    values: NDArray[np.int8],
    transform: Affine,
    selected: NDArray[np.bool_],
    clip: Polygon,
    tolerance: float,
    min_area: float,
    minus: BaseGeometry | None = None,
) -> list[Polygon]:
    """Polygonise one class of the mask and cut it down to what is drawn."""
    if not selected.any():
        return []

    traced: list[Polygon] = []
    for geometry, _value in features.shapes(
        selected.astype(np.uint8), mask=selected, transform=transform
    ):
        region = shape(geometry).intersection(clip)
        if minus is not None and not region.is_empty:
            region = region.difference(minus)
        for piece in _parts(region):
            if piece.area < min_area:
                continue
            simplified = piece.simplify(tolerance, preserve_topology=True)
            for part in _parts(simplified):
                pruned = _prune(part, min_area)
                if not pruned.is_empty:
                    traced.append(pruned)
    return traced


def _parts(geometry: BaseGeometry) -> list[Polygon]:
    """Every polygon in whatever an overlay operation handed back.

    Clipping and differencing can return a GeometryCollection with lines and
    points in it where two boundaries touch without crossing. Those have no
    area and nothing to draw.
    """
    if geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if hasattr(geometry, 'geoms'):
        return [part for part in geometry.geoms if isinstance(part, Polygon)]
    return []


def _prune(polygon: Polygon, min_area: float) -> Polygon:
    """Drop the holes too small to see, on the same rule as the pieces."""
    kept = [
        ring for ring in polygon.interiors if Polygon(ring).area >= min_area
    ]
    if len(kept) == len(polygon.interiors):
        return polygon
    return Polygon(polygon.exterior, kept)
