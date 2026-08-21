from __future__ import annotations

import pytest
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from wordie.boundaries import NamedShelf
from wordie.outlines import Outline
from wordie.projections import area_km2, centroid_lonlat
from wordie.shelves import name_outlines


def make_shelf(key: str, geometry: BaseGeometry) -> NamedShelf:
    return NamedShelf(
        key=key,
        canonical=key,
        display=key,
        geometry=geometry,
        source_names=(key,),
        area_km2=area_km2(geometry),
        centroid=centroid_lonlat(geometry),
    )


def make_outline(geometry: BaseGeometry) -> Outline:
    return Outline(
        geometry=geometry,
        area_km2=area_km2(geometry),
        centroid=centroid_lonlat(geometry),
    )


class TestSingleClaim:
    def test_a_body_claimed_by_one_shelf_takes_that_name(self) -> None:
        shelf = make_shelf('Amery', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        body = make_outline(box(0.0, 1.0e6, 1.0e5, 1.1e6))

        named, report = name_outlines([body], [shelf])

        assert [s.display for s in named] == ['Amery']
        assert report.named_count == 1
        assert report.split_count == 0

    def test_keeps_ice_that_grew_past_the_named_polygon(self) -> None:
        # BedMachine's nominal date is 2015 and the boundaries describe the
        # IPY, so a front that advanced sits outside every named polygon.
        # With only one claimant there is nothing to argue about: it is that
        # shelf, and cropping it would draw a front that no dataset asserts.
        shelf = make_shelf('Amery', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        grown = make_outline(box(0.0, 1.0e6, 1.4e5, 1.1e6))

        named, _report = name_outlines([grown], [shelf])

        assert named[0].area_km2 == pytest.approx(
            area_km2(grown.geometry), rel=1e-9
        )

    def test_separate_bodies_of_one_shelf_are_gathered(self) -> None:
        shelf = make_shelf('Getz', box(0.0, 1.0e6, 3.0e5, 1.1e6))
        left = make_outline(box(0.0, 1.0e6, 1.0e5, 1.1e6))
        right = make_outline(box(2.0e5, 1.0e6, 3.0e5, 1.1e6))

        named, _report = name_outlines([left, right], [shelf])

        assert len(named) == 1
        assert named[0].geometry.geom_type == 'MultiPolygon'


class TestSplitting:
    def test_cuts_a_body_two_shelves_both_claim(self) -> None:
        # Filchner and Ronne in miniature: BedMachine has them as one
        # connected body, and only the named polygons say where the line goes.
        west = make_shelf('Ronne', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        east = make_shelf('Filchner', box(1.0e5, 1.0e6, 1.5e5, 1.1e6))
        joined = make_outline(box(0.0, 1.0e6, 1.5e5, 1.1e6))

        named, report = name_outlines([joined], [west, east])

        assert {s.display for s in named} == {'Ronne', 'Filchner'}
        assert report.split_count == 1
        # The cut divides the body rather than duplicating or losing it.
        # Checked in the map plane, where it holds exactly. The reported
        # areas agree only to about 1e-5, and for a reason worth knowing:
        # they are measured by reprojecting to an equal-area projection
        # vertex by vertex, and cutting the body introduces a vertex partway
        # along an edge that the whole body did not have. That vertex does
        # not land on the straight line between its neighbours once
        # reprojected, so the pieces enclose a hair more than the original.
        assert sum(s.geometry.area for s in named) == pytest.approx(
            joined.geometry.area, rel=1e-12
        )
        assert sum(s.area_km2 for s in named) == pytest.approx(
            area_km2(joined.geometry), rel=1e-4
        )

    def test_the_larger_side_of_the_cut_is_the_larger_shelf(self) -> None:
        west = make_shelf('Ronne', box(0.0, 1.0e6, 1.2e5, 1.1e6))
        east = make_shelf('Filchner', box(1.2e5, 1.0e6, 1.5e5, 1.1e6))
        joined = make_outline(box(0.0, 1.0e6, 1.5e5, 1.1e6))

        named, _report = name_outlines([joined], [west, east])

        assert named[0].display == 'Ronne'

    def test_leftover_goes_to_the_nearer_of_the_claimants(self) -> None:
        # A strip beyond both named polygons, but nearer the eastern one.
        west = make_shelf('Ronne', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        east = make_shelf('Filchner', box(1.0e5, 1.0e6, 1.5e5, 1.1e6))
        grown = make_outline(box(0.0, 1.0e6, 1.8e5, 1.1e6))

        named, report = name_outlines([grown], [west, east])

        by_name = {s.display: s for s in named}
        assert report.adopted_area_km2 > 0.0
        assert by_name['Filchner'].area_km2 > area_km2(east.geometry)
        assert by_name['Ronne'].area_km2 == pytest.approx(
            area_km2(west.geometry), rel=1e-6
        )

    def test_nothing_is_lost_when_leftover_is_adopted(self) -> None:
        west = make_shelf('Ronne', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        east = make_shelf('Filchner', box(1.0e5, 1.0e6, 1.5e5, 1.1e6))
        grown = make_outline(box(0.0, 1.0e6, 1.8e5, 1.1e6))

        named, _report = name_outlines([grown], [west, east])

        assert sum(s.geometry.area for s in named) == pytest.approx(
            grown.geometry.area, rel=1e-12
        )


class TestDropping:
    def test_a_body_no_shelf_claims_is_dropped(self) -> None:
        # An iceberg. The real data has 873 of these, and the game cannot ask
        # about a shape with no name.
        shelf = make_shelf('Amery', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        berg = make_outline(box(1.0e6, -1.0e6, 1.05e6, -9.5e5))

        named, report = name_outlines([berg], [shelf])

        assert named == []
        assert report.dropped_count == 1
        assert report.dropped_area_km2 == pytest.approx(
            area_km2(berg.geometry), rel=1e-9
        )

    def test_dropping_one_body_does_not_disturb_another(self) -> None:
        shelf = make_shelf('Amery', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        real = make_outline(box(0.0, 1.0e6, 1.0e5, 1.1e6))
        berg = make_outline(box(1.0e6, -1.0e6, 1.05e6, -9.5e5))

        named, report = name_outlines([real, berg], [shelf])

        assert len(named) == 1
        assert report.dropped_count == 1

    def test_a_shelf_with_no_floating_ice_simply_does_not_appear(
        self,
    ) -> None:
        # Paternostro in the real data: named in MEaSUREs, but BedMachine has
        # nothing floating there.
        present = make_shelf('Amery', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        absent = make_shelf('Paternostro', box(2.0e6, 5.0e5, 2.01e6, 5.1e5))
        body = make_outline(box(0.0, 1.0e6, 1.0e5, 1.1e6))

        named, _report = name_outlines([body], [present, absent])

        assert [s.display for s in named] == ['Amery']


class TestReport:
    def test_the_areas_account_for_everything_that_went_in(self) -> None:
        west = make_shelf('Ronne', box(0.0, 1.0e6, 1.0e5, 1.1e6))
        east = make_shelf('Filchner', box(1.0e5, 1.0e6, 1.5e5, 1.1e6))
        joined = make_outline(box(0.0, 1.0e6, 1.8e5, 1.1e6))
        berg = make_outline(box(1.0e6, -1.0e6, 1.05e6, -9.5e5))

        _named, report = name_outlines([joined, berg], [west, east])

        total_in = area_km2(joined.geometry) + area_km2(berg.geometry)
        assert (
            report.named_area_km2 + report.dropped_area_km2
        ) == pytest.approx(total_in, rel=1e-4)

    def test_ordered_largest_first(self) -> None:
        big = make_shelf('Ross', box(0.0, 1.0e6, 3.0e5, 1.3e6))
        small = make_shelf('Wordie', box(1.0e6, 1.0e6, 1.02e6, 1.02e6))
        named, _report = name_outlines(
            [make_outline(big.geometry), make_outline(small.geometry)],
            [big, small],
        )

        areas = [s.area_km2 for s in named]
        assert areas == sorted(areas, reverse=True)

    def test_nothing_in_nothing_out(self) -> None:
        named, report = name_outlines([], [])
        assert named == []
        assert report.named_count == 0
