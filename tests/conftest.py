"""Shared fixtures.

Everything here is synthetic. The real BedMachine file is hundreds of
megabytes and cannot be redistributed, so the tests build small rasters whose
answers are known by construction instead.
"""

from __future__ import annotations

import numpy as np
import pytest
import xarray as xr
from affine import Affine
from numpy.typing import NDArray

#: A grid centred on the South Pole, 1 km cells, laid out the way BedMachine
#: lays its own out: x ascending, y descending.
CELL_SIZE_M = 1000.0
GRID_CELLS = 40


@pytest.fixture
def transform() -> Affine:
    half = GRID_CELLS * CELL_SIZE_M / 2.0
    return Affine(CELL_SIZE_M, 0.0, -half, 0.0, -CELL_SIZE_M, half)


@pytest.fixture
def shelf_with_ice_rise() -> NDArray[np.bool_]:
    """A square of floating ice with a square ice rise inside it."""
    mask = np.zeros((GRID_CELLS, GRID_CELLS), dtype=bool)
    mask[8:32, 8:32] = True
    mask[18:22, 18:22] = False
    return mask


def write_bedmachine(
    path: str,
    mask_values: NDArray[np.integer],
    flag_meanings: str | None = (
        'ocean ice_free_land grounded_ice floating_ice lake_vostok'
    ),
) -> None:
    """Write a minimal file with the structure the reader expects."""
    cells = mask_values.shape[0]
    half = cells * CELL_SIZE_M / 2.0
    x = np.arange(cells) * CELL_SIZE_M - half + CELL_SIZE_M / 2.0
    y = half - CELL_SIZE_M / 2.0 - np.arange(cells) * CELL_SIZE_M
    attrs = {} if flag_meanings is None else {'flag_meanings': flag_meanings}
    dataset = xr.Dataset(
        {'mask': (('y', 'x'), mask_values.astype(np.int8), attrs)},
        coords={'x': x, 'y': y},
    )
    dataset.to_netcdf(path)
