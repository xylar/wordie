from __future__ import annotations

from typing import Any

import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from wordie.payload import (
    CRS_NAME,
    MAX_FLOOR_FRACTION,
    PayloadStats,
    build_payload,
    display_tolerance,
    simplify_for_display,
)
from wordie.projections import area_km2, centroid_lonlat
from wordie.shelves import Shelf


def ragged(x0: float, y0: float, size: float, teeth: int) -> Polygon:
    """A square with a saw-toothed top edge, for something to simplify."""
    step = size / (2 * teeth)
    top = []
    for i in range(2 * teeth + 1):
        x = x0 + i * step
        top.append((x, y0 + size + (step * 0.05 if i % 2 else 0.0)))
    return Polygon(
        [(x0, y0), (x0 + size, y0), *reversed(top), (x0, y0 + size)]
    )


def make_shelf(key: str, geometry: Polygon | MultiPolygon) -> Shelf:
    return Shelf(
        key=key,
        display=key,
        geometry=geometry,
        area_km2=area_km2(geometry),
        centroid=centroid_lonlat(geometry),
    )


class TestRelativeSimplification:
    def test_removes_detail_below_the_tolerance(self) -> None:
        shape = ragged(0.0, 1.0e6, 1.0e5, teeth=40)
        simplified, _holes, _cut = simplify_for_display(shape, fraction=0.01)

        assert len(simplified.exterior.coords) < len(shape.exterior.coords)

    def test_treats_a_small_shelf_like_a_large_one(self) -> None:
        # The whole reason the tolerance is a fraction. Ross is 500,000 km2
        # and Rydberg Peninsula is under 2, but both are drawn at the same
        # size, so the same *relative* tolerance has to leave them equally
        # detailed. An absolute tolerance would erase the smaller outright.
        big = ragged(0.0, 1.0e6, 1.0e6, teeth=40)
        small = ragged(0.0, 1.0e6, 1.0e3, teeth=40)

        big_simple, _h, _c = simplify_for_display(big, fraction=0.002)
        small_simple, _h, _c = simplify_for_display(small, fraction=0.002)

        assert len(big_simple.exterior.coords) == len(
            small_simple.exterior.coords
        )

    def test_an_absolute_tolerance_would_not(self) -> None:
        # Guards the claim above: 500 m is a rounding error on the big shape
        # and a quarter of the small one.
        big = ragged(0.0, 1.0e6, 1.0e6, teeth=40)
        small = ragged(0.0, 1.0e6, 2.0e3, teeth=40)

        assert len(big.simplify(500.0).exterior.coords) > 10
        assert len(small.simplify(500.0).exterior.coords) <= 5

    def test_keeps_the_result_a_valid_polygon(self) -> None:
        # Without preserve_topology, Douglas-Peucker will fold a narrow inlet
        # across itself and render a shape the data never contained.
        shape = ragged(0.0, 1.0e6, 1.0e5, teeth=60)
        simplified, _holes, _cut = simplify_for_display(shape, fraction=0.05)
        assert simplified.is_valid

    def test_rejects_a_shape_with_no_extent(self) -> None:
        with pytest.raises(ValueError, match='no extent'):
            simplify_for_display(Polygon())


class TestHolePruning:
    def _with_holes(self) -> Polygon:
        outer = box(0.0, 1.0e6, 1.0e5, 1.1e6)
        big_rise = box(2.0e4, 1.02e6, 5.0e4, 1.05e6)
        speck = box(8.0e4, 1.08e6, 8.01e4, 1.0801e6)
        return outer.difference(big_rise).difference(speck)

    def test_keeps_an_ice_rise_worth_seeing(self) -> None:
        _geometry, holes, _cut = simplify_for_display(
            self._with_holes(), fraction=0.0
        )
        assert holes >= 1

    def test_drops_a_hole_smaller_than_a_pixel(self) -> None:
        _geometry, holes, cut = simplify_for_display(
            self._with_holes(), fraction=0.0, min_hole_fraction=4.0e-6
        )
        assert cut == 1
        assert holes == 1

    def test_keeping_everything_is_available(self) -> None:
        _geometry, holes, cut = simplify_for_display(
            self._with_holes(), fraction=0.0, min_hole_fraction=0.0
        )
        assert cut == 0
        assert holes == 2


class TestPayload:
    def _payload(self) -> tuple[dict[str, Any], PayloadStats]:
        shelves = [
            make_shelf('Ross', box(0.0, 1.0e6, 2.0e5, 1.2e6)),
            make_shelf('Wordie', box(1.0e6, 5.0e5, 1.005e6, 5.05e5)),
        ]
        return build_payload(shelves)

    def test_is_a_feature_collection(self) -> None:
        payload, _stats = self._payload()
        assert payload['type'] == 'FeatureCollection'
        assert len(payload['features']) == 2

    def test_declares_the_projection_it_is_written_in(self) -> None:
        # The geometry is in metres, not degrees. Saying so in the file is
        # what keeps that a decision rather than a trap.
        payload, _stats = self._payload()
        assert payload['crs'] == CRS_NAME

    def test_coordinates_are_whole_metres(self) -> None:
        payload, _stats = self._payload()
        for feature in payload['features']:
            for polygon in feature['geometry']['coordinates']:
                for ring in polygon:
                    for x, y in ring:
                        assert isinstance(x, int)
                        assert isinstance(y, int)

    def test_every_feature_is_a_multipolygon(self) -> None:
        # One shape per shelf regardless of how many pieces it is in, so the
        # renderer never has to branch on geometry type.
        payload, _stats = self._payload()
        for feature in payload['features']:
            assert feature['geometry']['type'] == 'MultiPolygon'

    def test_carries_the_name_and_where_the_shelf_is(self) -> None:
        payload, _stats = self._payload()
        properties = payload['features'][0]['properties']

        assert properties['key'] == 'Ross'
        assert properties['name'] == 'Ross'
        assert properties['area_km2'] > 0.0
        # Degrees, unlike the geometry: the game scores with a geodesic.
        assert -180.0 <= properties['lon'] <= 180.0
        assert -90.0 <= properties['lat'] <= 0.0

    def test_keys_are_unique(self) -> None:
        payload, _stats = self._payload()
        keys = [f['properties']['key'] for f in payload['features']]
        assert len(set(keys)) == len(keys)

    def test_reports_what_it_cost(self) -> None:
        _payload, stats = self._payload()
        assert stats.shelf_count == 2
        assert stats.vertex_count > 0
        assert stats.max_area_change < 0.01

    def test_an_empty_run_produces_an_empty_collection(self) -> None:
        payload, stats = build_payload([])
        assert payload['features'] == []
        assert stats.shelf_count == 0


class TestAttribution:
    def test_names_both_sources_in_the_file_itself(self) -> None:
        # Citation is the condition both datasets attach to their use, and
        # this file travels on its own -- served from a page, saved by
        # whoever wants it, separate from the README that documents it.
        payload, _stats = build_payload([])
        roles = {source['role'] for source in payload['sources']}

        assert roles == {'ice shelf geometry', 'ice shelf names'}
        for source in payload['sources']:
            assert source['citation']
            assert source['doi'].startswith('https://doi.org/10.5067/')
            assert source['reference']

    def test_says_it_is_not_the_source_data(self) -> None:
        # Scientific honesty rather than licensing: these outlines are
        # simplified per shelf, so they are not at a uniform resolution and
        # nobody should measure anything with them.
        payload, _stats = build_payload([])

        assert 'not suitable for measurement' in payload['note']
        assert 'Cite the sources below, not this file' in payload['note']


def staircase(x0: float, y0: float, cells: int, cell: float) -> Polygon:
    """A diagonal edge as a raster traces it: one cell at a time."""
    steps: list[tuple[float, float]] = []
    for i in range(cells):
        steps.append((x0 + i * cell, y0 + i * cell))
        steps.append((x0 + (i + 1) * cell, y0 + i * cell))
    far = x0 + cells * cell
    return Polygon([*steps, (far, y0 - cells * cell), (x0, y0 - cells * cell)])


class TestSourceGridFloor:
    def test_flattens_the_staircase_the_raster_leaves(self) -> None:
        # An outline traced from a 500 m mask runs along cell edges, and no
        # ice front is stepped at 500 m. Without this floor the grid shows
        # through on every shelf narrower than 250 km, which is 36 of the 52
        # in the everyday answer pool.
        stepped = staircase(0.0, 1.0e6, cells=100, cell=500.0)

        with_floor, _h, _c = simplify_for_display(stepped, source_cell_m=500.0)
        without, _h, _c = simplify_for_display(stepped, source_cell_m=0.0)

        assert len(with_floor.exterior.coords) < len(without.exterior.coords)
        assert len(with_floor.exterior.coords) < 20

    def test_the_floor_is_capped_against_the_piece_not_the_shelf(
        self,
    ) -> None:
        # Wordie is why. Its five fragments are strung over 63 km but the
        # smallest is 3 km across, and a floor capped against the shelf would
        # apply a whole cell to a fragment six cells wide and swallow it.
        shelf_extent = 60_000.0
        piece_extent = 3_000.0

        against_piece = display_tolerance(shelf_extent, piece_extent)
        against_shelf = display_tolerance(shelf_extent, shelf_extent)

        assert against_piece < against_shelf
        assert against_piece <= MAX_FLOOR_FRACTION * piece_extent

    def test_a_small_fragment_keeps_its_detail_beside_a_large_one(
        self,
    ) -> None:
        big = staircase(0.0, 1.0e6, cells=100, cell=500.0)
        small = staircase(2.0e5, 1.0e6, cells=6, cell=500.0)
        shelf = MultiPolygon([big, small])

        simplified, _h, _c = simplify_for_display(shelf, source_cell_m=500.0)
        pieces = sorted(simplified.geoms, key=lambda p: -p.area)

        # The large piece loses its staircase; the small one keeps what it has,
        # because there is no smoother outline underneath it in the data.
        assert len(pieces[0].exterior.coords) < 20
        assert len(pieces[1].exterior.coords) == len(small.exterior.coords)

    def test_the_display_tolerance_wins_on_a_large_shelf(self) -> None:
        # Ross is 991 km across, so half a pixel is already twice a cell.
        assert display_tolerance(991_000.0, 991_000.0) == pytest.approx(991.0)

    def test_the_floor_wins_on_a_small_one(self) -> None:
        # Larsen B is 63.5 km across, where half a pixel is only 64 m.
        assert display_tolerance(63_500.0, 63_500.0) == pytest.approx(500.0)
