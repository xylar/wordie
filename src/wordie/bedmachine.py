"""Reading the floating-ice mask out of a BedMachine Antarctica file.

The file is a single netCDF-4 of some hundreds of megabytes holding a dozen
fields; the pipeline wants exactly one of them.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import xarray as xr
from affine import Affine
from numpy.typing import NDArray

#: The value BedMachine's ``mask`` uses for floating ice. Documented for v3 and
#: v4 alike as ``0 ocean, 1 ice_free_land, 2 grounded_ice, 3 floating_ice,
#: 4 lake_vostok``.
FLOATING_ICE = 3

#: What the ``mask`` variable should say its values mean. Checked rather than
#: assumed: the pipeline was developed against v3 and is meant to be run
#: against v4, and a silently renumbered mask would produce a plausible map of
#: the wrong thing.
EXPECTED_FLAG_MEANINGS = (
    'ocean',
    'ice_free_land',
    'grounded_ice',
    'floating_ice',
    'lake_vostok',
)


class MaskConventionError(RuntimeError):
    """Raised when a BedMachine file does not label its mask as expected."""


def _check_flag_meanings(mask: xr.DataArray) -> None:
    meanings = mask.attrs.get('flag_meanings')
    if meanings is None:
        # Older or hand-edited files may omit the attribute. Nothing can be
        # verified, so say so rather than pretending the check passed.
        raise MaskConventionError(
            'the mask variable has no flag_meanings attribute, so its '
            'convention cannot be verified; expected '
            f'{" ".join(EXPECTED_FLAG_MEANINGS)}'
        )
    found = tuple(str(meanings).split())
    if found[: len(EXPECTED_FLAG_MEANINGS)] != EXPECTED_FLAG_MEANINGS:
        raise MaskConventionError(
            f'unexpected mask convention {found!r}; this pipeline reads '
            f'{FLOATING_ICE} as floating ice, which relies on '
            f'{EXPECTED_FLAG_MEANINGS!r}'
        )


def _affine_from_centres(
    x: NDArray[np.floating], y: NDArray[np.floating]
) -> Affine:
    """Build the raster transform from arrays of cell-centre coordinates.

    BedMachine stores centres; rasterio wants the outer edge of the corner
    cell, so each is stepped back by half a cell. The y step is negative --
    the rows run from the top of the grid down -- and the arithmetic below
    holds either way rather than assuming a sign.
    """
    if x.size < 2 or y.size < 2:
        raise ValueError('need at least two cells along each axis')
    dx = float(x[1] - x[0])
    dy = float(y[1] - y[0])
    west = float(x[0]) - dx / 2.0
    north = float(y[0]) - dy / 2.0
    return Affine(dx, 0.0, west, 0.0, dy, north)


def read_mask(path: Path | str) -> tuple[NDArray[np.int8], Affine]:
    """Read the whole `mask` field from a BedMachine file.

    Returns the values as the file has them and the affine transform placing
    them in EPSG:3031, which is the grid BedMachine is already on -- no
    resampling happens here, and the outlines that come out sit exactly on
    cell edges of the source.

    The classes other than floating ice are not waste. Which of them lies
    across a boundary is what says whether that boundary is a calving front or
    a grounding line; see `margins.py`.
    """
    with xr.open_dataset(path) as dataset:
        if 'mask' not in dataset:
            raise MaskConventionError(
                f'{path} has no `mask` variable; is it a BedMachine file?'
            )
        mask = dataset['mask']
        _check_flag_meanings(mask)
        values = np.asarray(mask.values)
        transform = _affine_from_centres(
            dataset['x'].values, dataset['y'].values
        )
    return values, transform


def read_floating_mask(path: Path | str) -> tuple[NDArray[np.bool_], Affine]:
    """Read floating ice from a BedMachine file, as a boolean mask."""
    values, transform = read_mask(path)
    return np.asarray(values == FLOATING_ICE), transform
