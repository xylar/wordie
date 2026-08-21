from __future__ import annotations

import pytest
from pyproj import Geod
from shapely.geometry import Polygon, box

from wordie.projections import (
    area_km2,
    centroid_lonlat,
    to_geographic,
)

#: The independent implementation the area calculation is checked against.
#: Geod integrates the true area on the WGS 84 ellipsoid, by a completely
#: different route than reprojecting to an equal-area plane.
GEOD = Geod(ellps='WGS84')


def _geodesic_area_km2(polygon: Polygon) -> float:
    geographic = to_geographic(polygon)
    lons, lats = zip(*geographic.exterior.coords, strict=True)
    area, _perimeter = GEOD.polygon_area_perimeter(lons, lats)
    return abs(area) / 1.0e6


class TestAreaKm2:
    @pytest.mark.parametrize(
        'west,south,size',
        [
            (0.0, 1.0e6, 2.0e5),  # well inside the standard parallel
            (0.0, 2.0e6, 2.0e5),  # near 71 S, where the scale is true
            (1.0e6, -1.5e6, 3.0e5),  # the Ross sector, y negative
            (-2.0e6, 1.0e6, 2.5e5),  # the Weddell sector, x negative
        ],
    )
    def test_agrees_with_a_geodesic_area(
        self, west: float, south: float, size: float
    ) -> None:
        polygon = box(west, south, west + size, south + size)
        assert area_km2(polygon) == pytest.approx(
            _geodesic_area_km2(polygon), rel=1e-3
        )

    def test_subtracts_holes(self) -> None:
        outer = box(0.0, 1.0e6, 2.0e5, 1.2e6)
        hole = box(5.0e4, 1.05e6, 1.0e5, 1.1e6)
        with_hole = outer.difference(hole)

        assert area_km2(with_hole) < area_km2(outer)
        assert area_km2(with_hole) + area_km2(hole) == pytest.approx(
            area_km2(outer), rel=1e-6
        )


class TestCentroidLonLat:
    def test_the_pole_projects_to_ninety_south(self) -> None:
        square = box(-1.0e4, -1.0e4, 1.0e4, 1.0e4)
        _lon, lat = centroid_lonlat(square)
        assert lat == pytest.approx(-90.0, abs=1e-6)

    @pytest.mark.parametrize(
        'x,y,expected_lon',
        [
            (0.0, 1.0e6, 0.0),  # up the map is the Greenwich meridian
            (1.0e6, 0.0, 90.0),  # right is 90 east
            (0.0, -1.0e6, 180.0),  # down is the antimeridian, +-180
            (-1.0e6, 0.0, -90.0),  # left is 90 west
        ],
    )
    def test_orientation_matches_the_map(
        self, x: float, y: float, expected_lon: float
    ) -> None:
        # The same orientation the game's bearings assume, pinned here so the
        # pipeline and web/src/scoring.ts cannot drift apart.
        square = box(x - 1.0e3, y - 1.0e3, x + 1.0e3, y + 1.0e3)
        lon, lat = centroid_lonlat(square)
        # Compared as an angle rather than a number: the antimeridian is both
        # +180 and -180, and PROJ hands back the negative one.
        difference = (lon - expected_lon + 180.0) % 360.0 - 180.0
        assert difference == pytest.approx(0.0, abs=1e-6)
        assert lat < 0.0

    def test_latitude_falls_away_from_the_pole(self) -> None:
        near = box(-1.0e3, 9.9e5, 1.0e3, 1.01e6)
        far = box(-1.0e3, 2.4e6, 1.0e3, 2.5e6)
        assert centroid_lonlat(near)[1] < centroid_lonlat(far)[1]
