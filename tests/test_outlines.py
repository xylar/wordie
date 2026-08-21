from __future__ import annotations

import numpy as np
import pytest
from affine import Affine
from numpy.typing import NDArray

from wordie.outlines import Outline, polygonize_floating_ice


class TestIceRises:
    def test_keeps_an_enclosed_ice_rise_as_a_hole(
        self,
        shelf_with_ice_rise: NDArray[np.bool_],
        transform: Affine,
    ) -> None:
        # The choice this pipeline makes: an ice rise is a real feature and a
        # tell the audience recognises shelves by, so it stays.
        outlines = polygonize_floating_ice(shelf_with_ice_rise, transform)

        assert len(outlines) == 1
        assert outlines[0].hole_count == 1

    def test_the_hole_is_taken_out_of_the_area(
        self,
        shelf_with_ice_rise: NDArray[np.bool_],
        transform: Affine,
    ) -> None:
        solid = np.zeros_like(shelf_with_ice_rise)
        solid[8:32, 8:32] = True

        with_rise = polygonize_floating_ice(shelf_with_ice_rise, transform)[0]
        without_rise = polygonize_floating_ice(solid, transform)[0]

        # 24x24 cells of shelf less a 4x4 rise. Compared as a ratio rather
        # than against 560 km2 outright: reported areas are true areas, and
        # this test grid sits on the pole where polar stereographic understates
        # planar area by 5.7 percent. The ratio is free of that factor.
        assert with_rise.area_km2 / without_rise.area_km2 == pytest.approx(
            (24 * 24 - 4 * 4) / (24 * 24), rel=1e-3
        )

    def test_small_rises_can_be_dropped_on_request(
        self, transform: Affine
    ) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        mask[8:32, 8:32] = True
        mask[12:14, 12:14] = False  # 4 km2
        mask[20:26, 20:26] = False  # 36 km2

        kept_all = polygonize_floating_ice(mask, transform)
        kept_large = polygonize_floating_ice(
            mask, transform, min_hole_area_km2=10.0
        )

        assert kept_all[0].hole_count == 2
        assert kept_large[0].hole_count == 1
        # Dropping a hole gives its area back to the shelf.
        assert kept_large[0].area_km2 > kept_all[0].area_km2


class TestFiltering:
    def test_discards_speckle_below_the_threshold(
        self, transform: Affine
    ) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        mask[4:20, 4:20] = True  # a shelf
        mask[30, 30] = True  # one stray cell: 1 km2
        mask[35, 35] = True  # another

        outlines = polygonize_floating_ice(mask, transform, min_area_km2=2.0)

        assert len(outlines) == 1

    def test_keeps_everything_when_the_threshold_is_zero(
        self, transform: Affine
    ) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        mask[4:20, 4:20] = True
        mask[30, 30] = True

        outlines = polygonize_floating_ice(mask, transform, min_area_km2=0.0)

        assert len(outlines) == 2

    def test_returns_nothing_for_an_empty_mask(
        self, transform: Affine
    ) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        assert polygonize_floating_ice(mask, transform) == []


class TestOrderingAndMetadata:
    def test_orders_largest_first(self, transform: Affine) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        mask[2:6, 2:6] = True  # 16 km2
        mask[10:24, 10:24] = True  # 196 km2
        mask[30:36, 30:36] = True  # 36 km2

        areas = [
            outline.area_km2
            for outline in polygonize_floating_ice(mask, transform)
        ]

        assert areas == sorted(areas, reverse=True)
        assert len(areas) == 3
        # Ratios rather than absolute km2, for the reason given above.
        assert areas[0] / areas[2] == pytest.approx(196 / 16, rel=1e-2)

    def test_separate_bodies_of_ice_stay_separate(
        self, transform: Affine
    ) -> None:
        mask = np.zeros((40, 40), dtype=bool)
        mask[4:12, 4:12] = True
        mask[24:32, 24:32] = True

        assert len(polygonize_floating_ice(mask, transform)) == 2

    def test_bodies_touching_at_a_corner_are_one_region(
        self, transform: Affine
    ) -> None:
        # Worth pinning because it is a real choice, not an accident: GDAL's
        # polygonize connects through edges, not corners, so two blocks that
        # meet only diagonally come back as two outlines.
        mask = np.zeros((40, 40), dtype=bool)
        mask[10:15, 10:15] = True
        mask[15:20, 15:20] = True

        assert len(polygonize_floating_ice(mask, transform)) == 2

    def test_centroid_is_reported_in_longitude_and_latitude(
        self, transform: Affine
    ) -> None:
        # A block centred on the pole: whatever the longitude resolves to, the
        # latitude has to be within a whisker of -90.
        mask = np.zeros((40, 40), dtype=bool)
        mask[18:22, 18:22] = True

        outline = polygonize_floating_ice(mask, transform)[0]
        lon, lat = outline.centroid

        assert lat == pytest.approx(-90.0, abs=0.05)
        assert -180.0 <= lon <= 180.0


class TestArea:
    def test_reported_area_is_true_area_not_planar_area(self) -> None:
        # The reason projections.AREA_CRS exists, and the reason it is not a
        # fussy detail: the error in planar EPSG:3031 area changes sign across
        # the standard parallel. Near the pole it understates by about 5.7
        # percent; out at 3000 km it overstates by about 5.6 percent. A
        # pipeline that quoted planar areas would be wrong in both directions
        # at once, which is exactly the kind of error that survives review
        # because no single number looks absurd.
        cells, size = 100, 1000.0
        mask = np.ones((cells, cells), dtype=bool)

        near_pole = polygonize_floating_ice(
            mask, Affine(size, 0.0, -5.0e4, 0.0, -size, 5.0e4)
        )[0]
        far_out = polygonize_floating_ice(
            mask, Affine(size, 0.0, 2.95e6, 0.0, -size, 5.0e4)
        )[0]

        for outline in (near_pole, far_out):
            assert outline.geometry.area / 1.0e6 == pytest.approx(
                cells * cells, rel=1e-6
            )

        assert near_pole.area_km2 / (cells * cells) == pytest.approx(
            1.0568, rel=1e-3
        )
        assert far_out.area_km2 / (cells * cells) == pytest.approx(
            0.9441, rel=1e-3
        )


class TestOutlineDataclass:
    def test_hole_count_reads_the_geometry(
        self,
        shelf_with_ice_rise: NDArray[np.bool_],
        transform: Affine,
    ) -> None:
        outline = polygonize_floating_ice(shelf_with_ice_rise, transform)[0]
        assert isinstance(outline, Outline)
        assert outline.hole_count == len(outline.geometry.interiors)
