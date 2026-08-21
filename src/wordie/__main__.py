"""Command line entry point for the outline pipeline."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from wordie.bedmachine import read_floating_mask
from wordie.outlines import DEFAULT_MIN_AREA_KM2, polygonize_floating_ice
from wordie.projections import to_geographic


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='wordie-data',
        description=(
            'Derive Antarctic ice shelf outlines from published datasets.'
        ),
    )
    subparsers = parser.add_subparsers(dest='command', required=True)

    outlines = subparsers.add_parser(
        'outlines',
        help='trace floating ice in a BedMachine file into polygons',
    )
    outlines.add_argument(
        '--bedmachine',
        type=Path,
        required=True,
        help=(
            'path to a BedMachine Antarctica netCDF file. Download it from '
            'https://nsidc.org/data/nsidc-0756 with an Earthdata Login; it '
            'is not redistributed with this repository.'
        ),
    )
    outlines.add_argument(
        '--output',
        type=Path,
        help='write the outlines here as GeoJSON in longitude and latitude',
    )
    outlines.add_argument(
        '--min-area-km2',
        type=float,
        default=DEFAULT_MIN_AREA_KM2,
        help='discard polygons smaller than this (default: %(default)s)',
    )
    outlines.add_argument(
        '--min-hole-area-km2',
        type=float,
        default=0.0,
        help=(
            'discard ice rises smaller than this; the default of '
            '%(default)s keeps every one the mask resolves'
        ),
    )
    outlines.add_argument(
        '--top',
        type=int,
        default=20,
        help='how many outlines to summarise (default: %(default)s)',
    )
    return parser


def _run_outlines(args: argparse.Namespace) -> int:
    mask, transform = read_floating_mask(args.bedmachine)
    print(f'floating cells: {int(mask.sum()):,} of {mask.size:,} in the grid')

    outlines = polygonize_floating_ice(
        mask,
        transform,
        min_area_km2=args.min_area_km2,
        min_hole_area_km2=args.min_hole_area_km2,
    )
    total_area = sum(outline.area_km2 for outline in outlines)
    total_holes = sum(outline.hole_count for outline in outlines)
    print(
        f'{len(outlines):,} outlines, {total_area:,.0f} km2 of floating ice, '
        f'{total_holes:,} enclosed ice rises'
    )

    print(f'\nlargest {min(args.top, len(outlines))}:')
    for outline in outlines[: args.top]:
        lon, lat = outline.centroid
        print(
            f'  {outline.area_km2:12,.0f} km2  '
            f'{lat:7.2f} S {lon:8.2f} E  '
            f'{outline.hole_count:4d} rises'
        )

    if args.output is not None:
        collection = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'properties': {
                        'area_km2': round(outline.area_km2, 3),
                        'holes': outline.hole_count,
                        'lon': round(outline.centroid[0], 6),
                        'lat': round(outline.centroid[1], 6),
                    },
                    'geometry': to_geographic(
                        outline.geometry
                    ).__geo_interface__,
                }
                for outline in outlines
            ],
        }
        args.output.write_text(json.dumps(collection))
        print(f'\nwrote {args.output}')
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == 'outlines':
        return _run_outlines(args)
    raise AssertionError(f'unhandled command {args.command!r}')


if __name__ == '__main__':
    raise SystemExit(main())
