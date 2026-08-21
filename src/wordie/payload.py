"""Building the file the browser downloads.

The pipeline's own export, `wordie-data shelves`, is ordinary GeoJSON in
longitude and latitude: 5 MB, full resolution, for anyone who wants the data.
This is the other thing, the game's asset, and it is shaped by what one
renderer needs rather than by what a GIS expects.

Two decisions follow from the same fact, which is that every shelf is drawn
alone and scaled to fill the same box. Ross is 500,000 km2 and Rydberg
Peninsula is under 2, but on screen they are the same size, so anything
measured in metres is meaningless here: a 500 m tolerance is a twentieth of a
pixel on Ross and a quarter of the whole shape on Rydberg. Simplification is
therefore relative to each shelf's own extent, and so is the check on whether
a hole is still worth keeping.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from wordie.projections import extent_of
from wordie.shelves import Shelf

#: Simplification tolerance, as a fraction of a shelf's longest side.
#:
#: The game draws a shelf about 500 px across, so one pixel is 1/500 of the
#: extent. Half of that is invisible and removes 47% of the vertices; the
#: worst area change over all 164 shelves is 0.06%. This audience compares
#: shapes for a living, so the default errs towards keeping detail nobody can
#: see rather than losing detail somebody can.
DEFAULT_SIMPLIFY_FRACTION = 0.001

#: BedMachine's cell size, which is the floor on how far a vertex may move.
#:
#: An outline traced from a raster runs along cell edges, so it carries a
#: staircase that is quantisation rather than coastline -- no ice front is
#: stepped at 500 m. Removing it takes a tolerance of a whole cell, not the
#: half-cell the staircase deviates from its own chord: Douglas-Peucker keeps
#: the furthest point of any run it cannot discard whole, so at half a cell
#: every other step survives. Measured on Larsen B at the size the game draws
#: it, half a cell leaves the grid plainly visible, a whole cell removes it for
#: 0.25% of the area, and beyond that the coastline starts turning into facets.
#:
#: This matters more than it sounds. The display tolerance only exceeds it on
#: shelves wider than 250 km, and 36 of the 52 shelves in the everyday answer
#: pool are narrower than that -- so without a floor most of the game is drawn
#: with the grid showing through.
DEFAULT_SOURCE_CELL_M = 500.0

#: The floor never takes more than this fraction of a *piece's* own extent.
#:
#: Of the piece, not of the shelf, and Wordie is why. Its five fragments are
#: strung over 63 km but the smallest is 3 km across, so a floor capped
#: against the shelf's extent would apply a whole 500 m cell to a fragment six
#: cells wide and swallow it: capping against the shelf cost Wordie 3% of its
#: area, against the piece it costs 0.1%.
#:
#: Below a few cells across, the quantisation and the shape are the same
#: thing. Flattening such a piece does not reveal a smoother outline
#: underneath, because the data does not contain one -- so it is left alone,
#: stair-steps and all, as the most honest thing available.
MAX_FLOOR_FRACTION = 0.02

#: Drop an interior ring whose area is below this fraction of the shelf's
#: bounding box. A hole smaller than a pixel cannot be seen but still costs
#: coordinates; ice rises worth recognising are orders of magnitude larger.
DEFAULT_MIN_HOLE_FRACTION = 4.0e-6

#: The coordinate reference system the geometry is written in.
#:
#: EPSG:3031, not longitude and latitude. RFC 7946 asks for WGS 84 and allows
#: another system by prior arrangement, which this is: the only consumer is
#: the game, which draws in this projection, so writing anything else would
#: mean projecting 65,000 coordinates in the browser to undo work already
#: done here. It also lets every coordinate be a whole number of metres, which
#: is finer than the smallest shelf needs and compresses to a third of what
#: the same shapes cost as decimal degrees.
CRS_NAME = 'EPSG:3031'

#: Carried inside the payload, not only in the README.
#:
#: Citation is the condition both datasets attach to their use, and this file
#: travels on its own -- served from a web page, saved by whoever wants it,
#: quite separate from the repository that documents it. Naming the sources in
#: the file is what keeps the condition attached to the thing it applies to.
#:
#: The `note` is the other half, and it is about scientific honesty rather
#: than licensing. These outlines have been simplified for drawing and are not
#: the source data. Nobody should mistake them for it, least of all by finding
#: this file and citing it.
SOURCES = [
    {
        'role': 'ice shelf geometry',
        'title': 'MEaSUREs BedMachine Antarctica, Version 4',
        'citation': (
            'Morlighem, M. (2025). MEaSUREs BedMachine Antarctica '
            '(NSIDC-0756, Version 4). [Data Set]. Boulder, Colorado USA. '
            'NASA National Snow and Ice Data Center Distributed Active '
            'Archive Center.'
        ),
        'doi': 'https://doi.org/10.5067/POJQI54A45HX',
        'reference': (
            'Morlighem, M., Rignot, E., Binder, T., Blankenship, D. D., '
            'Drews, R., Eagles, G., et al. (2020). Deep glacial troughs and '
            'stabilizing ridges unveiled beneath the margins of the '
            'Antarctic ice sheet. Nature Geoscience, 13, 132-137.'
        ),
    },
    {
        'role': 'ice shelf names',
        'title': (
            'MEaSUREs Antarctic Boundaries for IPY 2007-2009 from '
            'Satellite Radar, Version 2'
        ),
        'citation': (
            'Mouginot, J., Scheuchl, B. & Rignot, E. (2017). MEaSUREs '
            'Antarctic Boundaries for IPY 2007-2009 from Satellite Radar '
            '(NSIDC-0709, Version 2). [Data Set]. Boulder, Colorado USA. '
            'NASA National Snow and Ice Data Center Distributed Active '
            'Archive Center.'
        ),
        'doi': 'https://doi.org/10.5067/AXE4121732AD',
        'reference': (
            'Rignot, E., Jacobs, S., Mouginot, J. & Scheuchl, B. (2013). '
            'Ice-Shelf Melting Around Antarctica. Science, 341, 266-270.'
        ),
    },
]

#: Why this file should not be used as data.
DERIVED_NOTE = (
    'Derived product. Ice shelf outlines traced from the BedMachine '
    'floating-ice mask, named by intersection with the MEaSUREs boundaries, '
    'then simplified for display. Simplification is relative to each shelf, '
    'so the geometry is not at a uniform resolution and is not suitable for '
    'measurement. Cite the sources below, not this file.'
)


@dataclass(frozen=True)
class PayloadStats:
    """What the payload cost, for the command line to report."""

    shelf_count: int
    vertex_count: int
    hole_count: int
    dropped_hole_count: int
    max_area_change: float


def _longest_side(geometry: BaseGeometry) -> float:
    return max(extent_of(geometry))


def _polygons(geometry: BaseGeometry) -> list[Polygon]:
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, Polygon):
        return [geometry]
    raise TypeError(f'cannot draw a {geometry.geom_type}')


def _prune_holes(
    polygon: Polygon, min_area: float
) -> tuple[Polygon, int, int]:
    """Drop interior rings too small to see. Returns (polygon, kept, cut)."""
    kept = [
        ring for ring in polygon.interiors if Polygon(ring).area >= min_area
    ]
    cut = len(polygon.interiors) - len(kept)
    if cut == 0:
        return polygon, len(kept), 0
    return Polygon(polygon.exterior, kept), len(kept), cut


def display_tolerance(
    shelf_extent: float,
    piece_extent: float,
    fraction: float = DEFAULT_SIMPLIFY_FRACTION,
    source_cell_m: float = DEFAULT_SOURCE_CELL_M,
) -> float:
    """How far a vertex of one piece of a shelf may move.

    Two terms, and the larger wins. One is what the display can resolve, taken
    against the whole shelf because the whole shelf is scaled into the box
    together. The other is what the source raster can assert -- below a cell
    there is no coastline left to keep, only the staircase of the grid -- and
    that one is capped against the piece, which may be very much smaller than
    the shelf it belongs to.
    """
    return max(
        fraction * shelf_extent,
        min(source_cell_m, MAX_FLOOR_FRACTION * piece_extent),
    )


def simplify_for_display(
    geometry: BaseGeometry,
    fraction: float = DEFAULT_SIMPLIFY_FRACTION,
    min_hole_fraction: float = DEFAULT_MIN_HOLE_FRACTION,
    source_cell_m: float = DEFAULT_SOURCE_CELL_M,
) -> tuple[BaseGeometry, int, int]:
    """Simplify a shelf relative to its own size and to the source grid.

    `preserve_topology` keeps the result a valid polygon: without it
    Douglas-Peucker will happily fold a narrow inlet across itself, and a
    self-intersecting ring renders as a shape the data never contained.
    """
    shelf_extent = _longest_side(geometry)
    min_hole_area = min_hole_fraction * shelf_extent * shelf_extent

    polygons, holes, dropped = [], 0, 0
    # Piece by piece, because the floor depends on how big the piece is.
    for piece in _polygons(geometry):
        tolerance = display_tolerance(
            shelf_extent, _longest_side(piece), fraction, source_cell_m
        )
        simplified = piece.simplify(tolerance, preserve_topology=True)
        if simplified.is_empty or not isinstance(simplified, Polygon):
            continue
        pruned, kept, cut = _prune_holes(simplified, min_hole_area)
        polygons.append(pruned)
        holes += kept
        dropped += cut

    if not polygons:
        raise ValueError('nothing survived simplification')

    result: BaseGeometry = (
        MultiPolygon(polygons) if len(polygons) > 1 else polygons[0]
    )
    return result, holes, dropped


def _rings(geometry: BaseGeometry) -> list[list[list[list[int]]]]:
    """Coordinates as whole metres, in GeoJSON's MultiPolygon nesting."""
    return [
        [
            [[int(round(x)), int(round(y))] for x, y in ring.coords]
            for ring in [polygon.exterior, *polygon.interiors]
        ]
        for polygon in _polygons(geometry)
    ]


def build_payload(
    shelves: list[Shelf],
    fraction: float = DEFAULT_SIMPLIFY_FRACTION,
    min_hole_fraction: float = DEFAULT_MIN_HOLE_FRACTION,
    source_cell_m: float = DEFAULT_SOURCE_CELL_M,
) -> tuple[dict[str, Any], PayloadStats]:
    """Build the FeatureCollection the game loads."""
    features = []
    vertices = holes = dropped = 0
    worst_area_change = 0.0

    for shelf in shelves:
        geometry, kept, cut = simplify_for_display(
            shelf.geometry, fraction, min_hole_fraction, source_cell_m
        )
        rings = _rings(geometry)
        vertices += sum(len(ring) for polygon in rings for ring in polygon)
        holes += kept
        dropped += cut
        if shelf.geometry.area > 0.0:
            worst_area_change = max(
                worst_area_change,
                abs(geometry.area - shelf.geometry.area) / shelf.geometry.area,
            )

        features.append(
            {
                'type': 'Feature',
                'properties': {
                    'key': shelf.key,
                    'name': shelf.display,
                    'area_km2': round(shelf.area_km2, 1),
                    # Longitude and latitude, unlike the geometry: the game
                    # scores a guess with a geodesic between these two points
                    # and a bearing in the map plane, and both want degrees.
                    'lon': round(shelf.centroid[0], 4),
                    'lat': round(shelf.centroid[1], 4),
                },
                'geometry': {
                    'type': 'MultiPolygon',
                    'coordinates': rings,
                },
            }
        )

    payload = {
        'type': 'FeatureCollection',
        'crs': CRS_NAME,
        'note': DERIVED_NOTE,
        'sources': SOURCES,
        'features': features,
    }
    return payload, PayloadStats(
        shelf_count=len(features),
        vertex_count=vertices,
        hole_count=holes,
        dropped_hole_count=dropped,
        max_area_change=worst_area_change,
    )
