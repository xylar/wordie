from __future__ import annotations

import numpy as np
import pytest
from affine import Affine
from shapely.geometry import Polygon
from shapely.ops import unary_union

from wordie.context import (
    BOX_FRACTION,
    MaskGrid,
    context_box,
)
from wordie.outlines import polygonize_floating_ice

CELL = 500.0

#: BedMachine's own values, spelled out so a test reads without the module.
SEA, ROCK, LAND_ICE, SHELF_ICE, LAKE = 0, 1, 2, 3, 4


def grid(values: np.ndarray) -> MaskGrid:
    """A mask on a north-up grid with its top-left corner at the origin."""
    rows = values.shape[0]
    return MaskGrid(
        values.astype(np.int8), Affine(CELL, 0, 0, 0, -CELL, rows * CELL)
    )


def only_body(mask: MaskGrid) -> Polygon:
    """The single connected body of floating ice in a mask."""
    outlines = polygonize_floating_ice(
        mask.values == SHELF_ICE, mask.transform, min_area_km2=0.0
    )
    assert len(outlines) == 1
    return outlines[0].geometry


class TestTheBoxDrawnAround:
    def test_is_square_and_sized_from_the_longer_side(self) -> None:
        # The game scales a shelf to its longer side and lets the slack fall
        # across the other, so the surroundings have to reach as far across
        # the short axis as the long one.
        shelf = Polygon([(0, 0), (400, 0), (400, 100), (0, 100)])

        drawn = context_box(shelf)
        min_x, min_y, max_x, max_y = drawn.bounds

        assert max_x - min_x == pytest.approx(max_y - min_y)
        assert max_x - min_x == pytest.approx(BOX_FRACTION * 400)

    def test_is_centred_on_the_shelf(self) -> None:
        shelf = Polygon([(100, 200), (500, 200), (500, 400), (100, 400)])

        min_x, min_y, max_x, max_y = context_box(shelf).bounds

        assert (min_x + max_x) / 2 == pytest.approx(300)
        assert (min_y + max_y) / 2 == pytest.approx(300)

    def test_scales_with_the_shelf_rather_than_the_world(self) -> None:
        # The whole game withholds the scale. A window of fixed width in
        # kilometres would say how big the shelf was before the player had
        # named anything.
        small = context_box(Polygon([(0, 0), (10, 0), (10, 10), (0, 10)]))
        large = context_box(
            Polygon([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])
        )

        assert max(large.bounds) / max(small.bounds) == pytest.approx(100.0)


class TestWindowing:
    def test_covers_the_box_with_a_cell_to_spare(self) -> None:
        # A cell of slack, so a region running up to the edge of the box is
        # traced against what is beyond it rather than against the end of the
        # array.
        mask = grid(np.zeros((20, 20)))
        wanted = (2000.0, 2000.0, 4000.0, 4000.0)

        values, transform = mask.window(wanted)
        origin_x, origin_y = transform * (0, 0)

        assert origin_x <= wanted[0] - CELL
        assert origin_y >= wanted[3] + CELL
        assert values.shape[0] >= 4 and values.shape[1] >= 4

    def test_stops_at_the_edge_of_the_grid(self) -> None:
        mask = grid(np.zeros((8, 8)))

        values, _transform = mask.window((-1.0e6, -1.0e6, 1.0e6, 1.0e6))

        assert values.shape == (8, 8)

    def test_is_a_view_rather_than_a_copy(self) -> None:
        # 13,333 cells square, and one window per shelf: copying would be the
        # whole mask again 164 times over.
        mask = grid(np.zeros((20, 20)))

        values, _transform = mask.window((2000.0, 2000.0, 4000.0, 4000.0))

        assert values.base is mask.values


class TestSurroundings:
    @staticmethod
    def shelf_in_a_bay() -> tuple[MaskGrid, Polygon]:
        """A shelf with grounded ice to the south and the sea to the north."""
        values = np.zeros((40, 40), dtype=np.int8)
        values[20:, :] = LAND_ICE
        values[10:25, 5:35] = SHELF_ICE
        mask = grid(values)
        return mask, only_body(mask)

    def test_trace_the_land_around_the_shelf(self) -> None:
        mask, shelf = self.shelf_in_a_bay()

        found = mask.surroundings(shelf)

        assert found.land
        # South of the shelf and nowhere north of it: the sea is not a layer,
        # it is what is left when neither of these covers the frame.
        land = unary_union(found.land)
        assert land.intersects(shelf.buffer(CELL))
        assert not land.intersects(shelf.buffer(-CELL))

    def test_count_rock_and_lake_vostok_as_land(self) -> None:
        # Anything sitting on the bed. Lake Vostok is thousands of kilometres
        # from any shelf and will never be in shot, and calling it land is the
        # answer that needs no exception.
        values = np.zeros((40, 40), dtype=np.int8)
        values[20:30, :] = ROCK
        values[30:, :] = LAKE
        values[10:25, 5:35] = SHELF_ICE
        mask = grid(values)

        found = mask.surroundings(only_body(mask))

        assert found.land

    def test_leave_the_shelf_out_of_the_ice_around_it(self) -> None:
        # The shelf is floating ice in the middle of its own frame. Left in,
        # it would be a second copy of the outline drawn underneath the real
        # one, in the colour reserved for somebody else's shelf.
        mask, shelf = self.shelf_in_a_bay()

        found = mask.surroundings(shelf)

        assert found.ice == []

    def test_keep_a_neighbour_across_a_cut(self) -> None:
        # Filchner and Ronne are one connected body of ice that the pipeline
        # cuts in two. Drawn as ocean, the cut would read as a front.
        mask, whole = self.shelf_in_a_bay()
        min_x, min_y, _max_x, max_y = whole.bounds
        west = whole.intersection(
            Polygon(
                [
                    (min_x, min_y),
                    (min_x + 5000, min_y),
                    (min_x + 5000, max_y),
                    (min_x, max_y),
                ]
            )
        )

        found = mask.surroundings(west)

        assert found.ice

    def test_drop_the_speckle_off_a_front(self) -> None:
        # The coast off an ice front is dotted with rocks and grounded bergs a
        # cell or two across. Drawn, they are dirt on the screen; counted,
        # they are a third of the vertices in the file.
        #
        # The threshold is a fraction of the shelf, like every other length in
        # the payload, so what counts as speckle depends on the shelf it is
        # beside: a single cell is a fifth of a pixel on a shelf 100 km across
        # and seventeen pixels on one 15 km across.
        values = np.zeros((240, 240), dtype=np.int8)
        values[60:150, 30:210] = SHELF_ICE
        values[30, 50] = ROCK
        values[30, 120] = ROCK
        mask = grid(values)
        shelf = only_body(mask)

        assert max(*shelf.bounds[2:]) - min(*shelf.bounds[:2]) > 40_000.0
        assert mask.surroundings(shelf).land == []
        # Given a threshold small enough to keep them, they come back -- so
        # they were dropped on size, not missed.
        assert mask.surroundings(shelf, min_piece_fraction=0.0).land
