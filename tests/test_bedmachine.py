from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from conftest import CELL_SIZE_M, GRID_CELLS, write_bedmachine
from wordie.bedmachine import (
    FLOATING_ICE,
    MaskConventionError,
    _affine_from_centres,
    read_floating_mask,
)


class TestAffineFromCentres:
    def test_steps_back_from_centres_to_the_grid_edge(self) -> None:
        # Centres at 0 and 100 with 100 m cells means the grid starts at -50,
        # not at 0. Getting this wrong offsets every outline by half a cell.
        x = np.array([0.0, 100.0, 200.0])
        y = np.array([200.0, 100.0, 0.0])
        transform = _affine_from_centres(x, y)
        assert transform.c == pytest.approx(-50.0)
        assert transform.f == pytest.approx(250.0)

    def test_carries_the_sign_of_a_descending_axis(self) -> None:
        x = np.array([0.0, 100.0])
        y = np.array([200.0, 100.0])
        transform = _affine_from_centres(x, y)
        assert transform.a == pytest.approx(100.0)
        assert transform.e == pytest.approx(-100.0)

    def test_handles_an_ascending_y_axis_too(self) -> None:
        x = np.array([0.0, 100.0])
        y = np.array([0.0, 100.0])
        transform = _affine_from_centres(x, y)
        assert transform.e == pytest.approx(100.0)
        assert transform.f == pytest.approx(-50.0)

    def test_rejects_a_grid_too_small_to_have_a_step(self) -> None:
        with pytest.raises(ValueError, match='at least two cells'):
            _affine_from_centres(np.array([0.0]), np.array([0.0]))


class TestReadFloatingMask:
    def test_selects_only_floating_ice(self, tmp_path: Path) -> None:
        values = np.zeros((GRID_CELLS, GRID_CELLS), dtype=np.int8)
        values[4:8, 4:8] = 2  # grounded ice
        values[10:14, 10:14] = FLOATING_ICE
        values[20:22, 20:22] = 4  # Lake Vostok
        path = tmp_path / 'bedmachine.nc'
        write_bedmachine(str(path), values)

        mask, transform = read_floating_mask(path)

        assert mask.dtype == np.bool_
        assert mask.sum() == 16
        assert transform.a == pytest.approx(CELL_SIZE_M)
        assert transform.e == pytest.approx(-CELL_SIZE_M)

    def test_rejects_a_renumbered_mask(self, tmp_path: Path) -> None:
        # The pipeline was written against v3 and is meant to run against v4.
        # If a later version reorders the flags, reading 3 as floating ice
        # would produce a plausible map of the wrong thing, so it refuses.
        values = np.zeros((GRID_CELLS, GRID_CELLS), dtype=np.int8)
        path = tmp_path / 'renumbered.nc'
        write_bedmachine(
            str(path),
            values,
            flag_meanings='ocean grounded_ice floating_ice ice_free_land',
        )
        with pytest.raises(MaskConventionError, match='unexpected mask'):
            read_floating_mask(path)

    def test_refuses_a_file_that_cannot_be_verified(
        self, tmp_path: Path
    ) -> None:
        values = np.zeros((GRID_CELLS, GRID_CELLS), dtype=np.int8)
        path = tmp_path / 'unlabelled.nc'
        write_bedmachine(str(path), values, flag_meanings=None)
        with pytest.raises(MaskConventionError, match='no flag_meanings'):
            read_floating_mask(path)

    def test_rejects_a_file_with_no_mask_at_all(self, tmp_path: Path) -> None:
        import xarray as xr

        path = tmp_path / 'not-bedmachine.nc'
        xr.Dataset({'bed': (('y', 'x'), np.zeros((4, 4)))}).to_netcdf(path)
        with pytest.raises(MaskConventionError, match='no `mask` variable'):
            read_floating_mask(path)
