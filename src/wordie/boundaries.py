"""Reading named ice shelves from the MEaSUREs Antarctic Boundaries.

The file is an ESRI shapefile, which is really four files travelling together:
geometry in `.shp`, an index in `.shx`, the coordinate system in `.prj`, and
the attribute table -- the names, the whole reason to open it at all -- in a
dBASE `.dbf`. Downloading only the `.shp` gets you 181 anonymous polygons, so
the reader checks for the attributes it needs and says which file is missing
rather than failing further down with something cryptic.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from wordie.names import canonical_name, display_name
from wordie.projections import MAP_CRS, area_km2, centroid_lonlat

#: The value of the TYPE attribute for a floating polygon. The file also
#: carries grounded drainage basins (GR) and islands (IS), which are not what
#: this game asks about.
FLOATING = 'FL'

#: Attributes the pipeline reads. NAME is the shelf, TYPE selects the floating
#: polygons, and Regions disambiguates the rare case of two unrelated features
#: sharing a name.
REQUIRED_COLUMNS = ('NAME', 'TYPE', 'Regions')

#: How far apart two polygons of the same name may be and still be treated as
#: pieces of one shelf.
#:
#: Sharing a NAME is not enough. This file has two polygons called `Fox`, one
#: in East Antarctica and one in the west, 4,359 km apart -- different features
#: that happen to share a name, and unioning them would produce a shelf
#: straddling the continent. Every genuine fragment group is far tighter: the
#: widest is Abbot, whose seven pieces span 115 km end to end, and the pieces
#: adjacent to one another are closer still. Three orders of magnitude separate
#: the two cases, so this threshold is not a delicate one.
DEFAULT_MAX_FRAGMENT_GAP_KM = 200.0

#: How the Regions attribute reads when it has to qualify a name.
REGION_LABELS = {
    'East': 'East Antarctica',
    'West': 'West Antarctica',
    'Peninsula': 'Antarctic Peninsula',
    'Islands': 'Islands',
}


class BoundariesError(RuntimeError):
    """Raised when the boundaries file is not what the pipeline expects."""


@dataclass(frozen=True)
class NamedShelf:
    """One named ice shelf, reassembled from however many polygons it took."""

    #: Unique identifier. Normally the canonical name; where two unrelated
    #: features share one, the region is appended to keep them apart.
    key: str
    #: The dataset's own spelling, with fragment suffixes removed: 'LarsenC'.
    canonical: str
    #: What the player reads: 'Larsen C'.
    display: str
    #: Outline in the EPSG:3031 map plane.
    geometry: BaseGeometry
    #: The raw NAME values that were merged, in dataset order. Kept so that a
    #: reviewer can see that Abbot really is seven polygons and check that
    #: nothing unrelated was swept in with them.
    source_names: tuple[str, ...]
    area_km2: float
    centroid: tuple[float, float]
    #: Set only when the name had to be qualified to stay unique.
    region: str | None = None

    @property
    def was_fragmented(self) -> bool:
        return len(self.source_names) > 1


def _check_columns(frame: gpd.GeoDataFrame, path: Path | str) -> None:
    missing = [name for name in REQUIRED_COLUMNS if name not in frame.columns]
    if not missing:
        return
    raise BoundariesError(
        f'{path} has no {", ".join(missing)} attribute(s). A shapefile keeps '
        'its attributes in a sibling .dbf file; if only the .shp was '
        'downloaded, the geometry loads but every name is missing. Fetch '
        'the .dbf, .shx and .prj alongside it.'
    )


@dataclass(frozen=True)
class _Member:
    """One polygon of the source file, before shelves are assembled."""

    raw_name: str
    region: str
    geometry: BaseGeometry


def _cluster_by_proximity(
    members: list[_Member], max_gap_m: float
) -> list[list[_Member]]:
    """Split same-named polygons into spatially coherent groups.

    Single linkage: two polygons join the same cluster if they are within
    `max_gap_m` of each other, so a chain of adjacent fragments holds together
    even when its ends are further apart than that. Groups are small -- seven
    polygons at most -- so the quadratic scan costs nothing.
    """
    clusters: list[list[_Member]] = []
    for member in members:
        touching = [
            cluster
            for cluster in clusters
            if any(
                member.geometry.distance(other.geometry) <= max_gap_m
                for other in cluster
            )
        ]
        if not touching:
            clusters.append([member])
            continue
        # The new member may bridge clusters that were previously apart.
        merged = [member]
        for cluster in touching:
            merged.extend(cluster)
            clusters.remove(cluster)
        clusters.append(merged)
    return clusters


def _build_shelf(
    name: str, cluster: list[_Member], qualify: bool
) -> NamedShelf:
    geometry = unary_union([member.geometry for member in cluster])
    region = cluster[0].region
    label = REGION_LABELS.get(region, region)
    return NamedShelf(
        key=f'{name}#{region}' if qualify else name,
        canonical=name,
        display=(
            f'{display_name(name)} ({label})'
            if qualify
            else display_name(name)
        ),
        geometry=geometry,
        source_names=tuple(member.raw_name for member in cluster),
        area_km2=area_km2(geometry),
        centroid=centroid_lonlat(geometry),
        region=region if qualify else None,
    )


def read_named_shelves(
    path: Path | str,
    min_area_km2: float = 0.0,
    max_fragment_gap_km: float = DEFAULT_MAX_FRAGMENT_GAP_KM,
) -> list[NamedShelf]:
    """Read the floating polygons and reassemble them into named shelves.

    Returned largest first. Fragments that MEaSUREs numbers or brackets --
    Abbot_1 through Abbot_6, the five pieces of Wordie, the two halves of
    Ross -- come back as one shelf each; see `names.canonical_name`.
    """
    frame = gpd.read_file(path)
    _check_columns(frame, path)

    if frame.crs is None or not frame.crs.equals(MAP_CRS):
        raise BoundariesError(
            f'{path} is in {frame.crs}, not the expected {MAP_CRS.name}. '
            "The pipeline assumes both sources share BedMachine's grid."
        )

    floating = frame[frame['TYPE'].str.strip() == FLOATING]
    if floating.empty:
        raise BoundariesError(
            f'{path} has no polygons with TYPE == {FLOATING!r}; the '
            f'values present are {sorted(set(frame["TYPE"].str.strip()))}'
        )

    grouped: dict[str, list[_Member]] = {}
    for raw_name, region, geometry in zip(
        floating['NAME'], floating['Regions'], floating.geometry, strict=True
    ):
        name = canonical_name(str(raw_name))
        grouped.setdefault(name, []).append(
            _Member(str(raw_name).strip(), str(region).strip(), geometry)
        )

    shelves = []
    for name, members in grouped.items():
        clusters = _cluster_by_proximity(members, max_fragment_gap_km * 1.0e3)
        qualify = len(clusters) > 1
        for cluster in clusters:
            shelf = _build_shelf(name, cluster, qualify=qualify)
            if shelf.area_km2 >= min_area_km2:
                shelves.append(shelf)
    shelves.sort(key=lambda shelf: shelf.area_km2, reverse=True)
    return shelves
