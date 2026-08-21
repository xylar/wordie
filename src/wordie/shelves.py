"""Attaching MEaSUREs names to the outlines traced from BedMachine.

Geometry comes from BedMachine and names come from the MEaSUREs boundaries,
and the two do not agree exactly: BedMachine's nominal date is 2015 while the
boundaries describe the fronts as they stood during the IPY, so 1.6% of
BedMachine's floating ice falls outside every named polygon.

Where that leftover sits decides what to do with it, and connectivity tells
them apart without a distance threshold to argue over. A connected body of
floating ice that overlaps a named polygon is that shelf, leftover included --
the shelf simply advanced or retreated since the boundaries were drawn. A
connected body that overlaps no named polygon at all is an iceberg or an
unnamed patch of island ice, and is dropped: the game cannot ask about a shape
with no name.

The same intersection does the other job the pipeline needs. BedMachine has
Filchner and Ronne as one connected body of 444,000 km2, because they are; the
MEaSUREs polygons name them separately, and cutting the body along that
boundary is what recovers the two answers the literature uses.
"""

from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.strtree import STRtree

from wordie.boundaries import NamedShelf
from wordie.outlines import Outline
from wordie.projections import area_km2, centroid_lonlat


@dataclass(frozen=True)
class Shelf:
    """A named ice shelf: BedMachine's geometry under a MEaSUREs name."""

    key: str
    display: str
    #: Outline in the EPSG:3031 map plane, holes and all.
    geometry: BaseGeometry
    area_km2: float
    #: Where the shelf is, as (lon, lat).
    centroid: tuple[float, float]


@dataclass(frozen=True)
class NamingReport:
    """What the naming step kept, split and threw away.

    Reported rather than logged in passing, because "1.6% of the ice went
    somewhere" is exactly the sort of thing a reader of this pipeline is
    entitled to see a number for.
    """

    named_count: int
    named_area_km2: float
    #: Bodies of floating ice overlapping no named polygon, and dropped.
    dropped_count: int
    dropped_area_km2: float
    #: Floating ice inside a kept body but outside every named polygon, given
    #: to the nearest named part of its own body.
    adopted_area_km2: float
    #: Bodies that had to be cut because more than one shelf claimed them.
    split_count: int


def _assign_leftover(
    leftover: BaseGeometry, parts: dict[str, BaseGeometry]
) -> dict[str, list[BaseGeometry]]:
    """Give each piece of leftover to the nearest named part beside it."""
    adopted: dict[str, list[BaseGeometry]] = {}
    if leftover.is_empty:
        return adopted
    keys = list(parts)
    geometries = [parts[key] for key in keys]
    tree = STRtree(geometries)
    pieces = (
        list(leftover.geoms)
        if leftover.geom_type.startswith('Multi')
        else [leftover]
    )
    for piece in pieces:
        nearest = tree.nearest(piece)
        adopted.setdefault(keys[int(nearest)], []).append(piece)
    return adopted


def name_outlines(
    outlines: list[Outline], shelves: list[NamedShelf]
) -> tuple[list[Shelf], NamingReport]:
    """Label BedMachine outlines with MEaSUREs names, largest first."""
    named_geometries = [shelf.geometry for shelf in shelves]
    tree = STRtree(named_geometries)

    collected: dict[str, list[BaseGeometry]] = {}
    dropped_count = 0
    dropped_area = 0.0
    adopted_area = 0.0
    split_count = 0

    for outline in outlines:
        body = outline.geometry
        # The tree gives candidates by bounding box; `intersects` decides.
        candidates = [
            shelves[int(index)]
            for index in tree.query(body)
            if shelves[int(index)].geometry.intersects(body)
        ]
        if not candidates:
            dropped_count += 1
            dropped_area += outline.area_km2
            continue

        if len(candidates) == 1:
            # Nothing to cut: the whole body is this shelf, whatever the
            # front has done since the boundaries were drawn.
            collected.setdefault(candidates[0].key, []).append(body)
            continue

        split_count += 1
        parts: dict[str, BaseGeometry] = {}
        for shelf in candidates:
            piece = body.intersection(shelf.geometry)
            if not piece.is_empty:
                parts[shelf.key] = piece
        if not parts:
            dropped_count += 1
            dropped_area += outline.area_km2
            continue

        leftover = body.difference(unary_union(list(parts.values())))
        for key, pieces in _assign_leftover(leftover, parts).items():
            parts[key] = unary_union([parts[key], *pieces])
        adopted_area += area_km2(leftover)

        for key, piece in parts.items():
            collected.setdefault(key, []).append(piece)

    by_key = {shelf.key: shelf for shelf in shelves}
    named = []
    for key, pieces in collected.items():
        geometry = unary_union(pieces) if len(pieces) > 1 else pieces[0]
        source = by_key[key]
        named.append(
            Shelf(
                key=key,
                display=source.display,
                geometry=geometry,
                area_km2=area_km2(geometry),
                centroid=centroid_lonlat(geometry),
            )
        )
    named.sort(key=lambda shelf: shelf.area_km2, reverse=True)

    return named, NamingReport(
        named_count=len(named),
        named_area_km2=sum(shelf.area_km2 for shelf in named),
        dropped_count=dropped_count,
        dropped_area_km2=dropped_area,
        adopted_area_km2=adopted_area,
        split_count=split_count,
    )
