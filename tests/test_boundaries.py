from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import box

from wordie.boundaries import (
    BoundariesError,
    _cluster_by_proximity,
    _Member,
    read_named_shelves,
)


def write_boundaries(
    path: Path,
    rows: list[tuple[str, str, str, float, float]],
    crs: str = 'EPSG:3031',
) -> None:
    """Write a shapefile of (NAME, TYPE, Regions, x, y) rows.

    Each row becomes a 20 km square centred on (x, y), which is enough
    geometry for the questions these tests ask.
    """
    frame = gpd.GeoDataFrame(
        {
            'NAME': [row[0] for row in rows],
            'TYPE': [row[1] for row in rows],
            'Regions': [row[2] for row in rows],
        },
        geometry=[
            box(row[3] - 1.0e4, row[4] - 1.0e4, row[3] + 1.0e4, row[4] + 1.0e4)
            for row in rows
        ],
        crs=crs,
    )
    frame.to_file(path)


class TestReassembly:
    def test_merges_numbered_fragments_into_one_shelf(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / 'boundaries.shp'
        write_boundaries(
            path,
            [
                ('Abbot', 'FL', 'West', 0.0, 1.0e6),
                ('Abbot_1', 'FL', 'West', 3.0e4, 1.0e6),
                ('Abbot_2', 'FL', 'West', 6.0e4, 1.0e6),
            ],
        )

        shelves = read_named_shelves(path)

        assert len(shelves) == 1
        assert shelves[0].display == 'Abbot'
        assert shelves[0].was_fragmented
        assert len(shelves[0].source_names) == 3

    def test_keeps_unrelated_shelves_apart(self, tmp_path: Path) -> None:
        path = tmp_path / 'boundaries.shp'
        write_boundaries(
            path,
            [
                ('Amery', 'FL', 'East', 2.0e6, 7.0e5),
                ('Totten', 'FL', 'East', 2.2e6, -1.0e6),
            ],
        )

        assert len(read_named_shelves(path)) == 2

    def test_ignores_grounded_and_island_polygons(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / 'boundaries.shp'
        write_boundaries(
            path,
            [
                ('Amery', 'FL', 'East', 2.0e6, 7.0e5),
                ('AmeryBasin', 'GR', 'East', 2.1e6, 7.0e5),
                ('Somewhere', 'IS', 'Islands', 1.0e6, 1.0e6),
            ],
        )

        shelves = read_named_shelves(path)

        assert [shelf.display for shelf in shelves] == ['Amery']


class TestSameNameDifferentPlace:
    def test_distant_namesakes_stay_separate(self, tmp_path: Path) -> None:
        # The real case: two polygons called Fox, 4,359 km apart, one in East
        # Antarctica and one in the west. Unioning them would make a shelf
        # straddling the continent.
        path = tmp_path / 'boundaries.shp'
        write_boundaries(
            path,
            [
                ('Fox', 'FL', 'East', 2.38e6, -1.08e6),
                ('Fox', 'FL', 'West', -1.80e6, 1.45e5),
            ],
        )

        shelves = read_named_shelves(path)

        assert len(shelves) == 2
        assert {shelf.display for shelf in shelves} == {
            'Fox (East Antarctica)',
            'Fox (West Antarctica)',
        }
        # The keys have to differ too, or one would overwrite the other
        # wherever shelves are indexed by name.
        assert len({shelf.key for shelf in shelves}) == 2

    def test_a_name_used_once_is_not_qualified(self, tmp_path: Path) -> None:
        path = tmp_path / 'boundaries.shp'
        write_boundaries(path, [('Amery', 'FL', 'East', 2.0e6, 7.0e5)])

        shelf = read_named_shelves(path)[0]

        assert shelf.display == 'Amery'
        assert shelf.key == 'Amery'
        assert shelf.region is None


class TestClustering:
    def _member(self, x: float) -> _Member:
        return _Member('X', 'East', box(x, 0.0, x + 1.0e4, 1.0e4))

    def test_links_through_a_chain_of_neighbours(self) -> None:
        # Single linkage, so a run of adjacent fragments holds together even
        # though its two ends are further apart than the threshold. Abbot is
        # exactly this: seven pieces spanning 115 km end to end.
        members = [self._member(x) for x in (0.0, 5.0e4, 1.0e5, 1.5e5)]

        clusters = _cluster_by_proximity(members, max_gap_m=6.0e4)

        assert len(clusters) == 1
        assert len(clusters[0]) == 4

    def test_splits_where_the_chain_breaks(self) -> None:
        members = [self._member(x) for x in (0.0, 2.0e4, 5.0e6)]

        clusters = _cluster_by_proximity(members, max_gap_m=6.0e4)

        assert sorted(len(cluster) for cluster in clusters) == [1, 2]

    def test_a_late_member_can_bridge_two_clusters(self) -> None:
        # Order matters to a naive implementation: the two ends are seen
        # first and look separate, then the middle arrives and joins them.
        members = [self._member(0.0), self._member(1.0e5), self._member(5.0e4)]

        clusters = _cluster_by_proximity(members, max_gap_m=6.0e4)

        assert len(clusters) == 1


class TestRejections:
    def test_says_which_file_holds_the_missing_names(
        self, tmp_path: Path
    ) -> None:
        # The failure a partial download produces: geometry loads, names do
        # not. Worth a message that names the .dbf, because the obvious
        # reading of "shapefile" is one file.
        path = tmp_path / 'geometry-only.shp'
        frame = gpd.GeoDataFrame(
            geometry=[box(0.0, 1.0e6, 1.0e4, 1.01e6)], crs='EPSG:3031'
        )
        frame.to_file(path)

        with pytest.raises(BoundariesError, match=r'\.dbf'):
            read_named_shelves(path)

    def test_rejects_the_wrong_projection(self, tmp_path: Path) -> None:
        path = tmp_path / 'wgs84.shp'
        frame = gpd.GeoDataFrame(
            {'NAME': ['Amery'], 'TYPE': ['FL'], 'Regions': ['East']},
            geometry=[box(70.0, -70.0, 71.0, -69.0)],
            crs='EPSG:4326',
        )
        frame.to_file(path)

        with pytest.raises(BoundariesError, match='not the expected'):
            read_named_shelves(path)

    def test_rejects_a_file_with_no_floating_polygons(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / 'grounded.shp'
        write_boundaries(path, [('AmeryBasin', 'GR', 'East', 2.0e6, 7.0e5)])

        with pytest.raises(BoundariesError, match='no polygons with TYPE'):
            read_named_shelves(path)


class TestFiltering:
    def test_drops_shelves_below_the_area_threshold(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / 'boundaries.shp'
        write_boundaries(
            path,
            [
                ('Amery', 'FL', 'East', 2.0e6, 7.0e5),
                ('Tiny', 'FL', 'East', 2.2e6, 7.0e5),
            ],
        )

        all_shelves = read_named_shelves(path)
        big_only = read_named_shelves(path, min_area_km2=1.0e6)

        assert len(all_shelves) == 2
        assert big_only == []

    def test_returns_largest_first(self, tmp_path: Path) -> None:
        path = tmp_path / 'boundaries.shp'
        frame = gpd.GeoDataFrame(
            {
                'NAME': ['Small', 'Large'],
                'TYPE': ['FL', 'FL'],
                'Regions': ['East', 'East'],
            },
            geometry=[
                box(0.0, 1.0e6, 1.0e4, 1.01e6),
                box(5.0e5, 1.0e6, 6.0e5, 1.1e6),
            ],
            crs='EPSG:3031',
        )
        frame.to_file(path)

        shelves = read_named_shelves(path)

        assert [shelf.display for shelf in shelves] == ['Large', 'Small']
