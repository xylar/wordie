"""Command line entry point for the outline pipeline."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from wordie.bedmachine import read_floating_mask
from wordie.boundaries import NamedShelf, read_named_shelves
from wordie.names import DISPLAY_OVERRIDES
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
    names = subparsers.add_parser(
        'names',
        help='list the named ice shelves in the MEaSUREs boundaries',
    )
    names.add_argument(
        '--boundaries',
        type=Path,
        required=True,
        help=(
            'path to IceBoundaries_Antarctica_v02.shp. Its .dbf, .shx and '
            '.prj must sit beside it; the names live in the .dbf. Download '
            'from https://nsidc.org/data/nsidc-0709 with an Earthdata Login.'
        ),
    )
    names.add_argument(
        '--min-area-km2',
        type=float,
        default=0.0,
        help='omit shelves smaller than this (default: %(default)s)',
    )
    names.add_argument(
        '--fragmented-only',
        action='store_true',
        help='list only shelves reassembled from more than one polygon',
    )
    names.add_argument(
        '--format',
        choices=('text', 'markdown'),
        default='text',
        help=(
            'markdown emits the full mapping as a table for review '
            '(default: %(default)s)'
        ),
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


def _naming_rule(shelf: NamedShelf) -> str:
    """How this shelf's display name was arrived at.

    The point of showing it is that a reviewer can go straight to the
    editorial decisions and skip the ~130 names the dataset already got right.
    """
    if shelf.canonical in DISPLAY_OVERRIDES:
        return 'override'
    if shelf.display == shelf.canonical:
        return 'unchanged'
    return 'derived'


def _print_markdown(shelves: list[NamedShelf]) -> None:
    counts = {'override': 0, 'derived': 0, 'unchanged': 0}
    for shelf in shelves:
        counts[_naming_rule(shelf)] += 1

    print('# Ice shelf names\n')
    print(
        'Generated by `wordie-data names --format markdown`. Every name the '
        'game can use, and how it was arrived at from the MEaSUREs '
        '`IceBoundaries_Antarctica_v02` attribute table.\n'
    )
    print(f'- **{len(shelves)} shelves** from 181 source polygons.')
    print(
        f'- **{counts["unchanged"]} unchanged** -- the dataset name is '
        'already what a player should read.'
    )
    print(
        f'- **{counts["derived"]} derived** -- underscores and CamelCase '
        'split by rule, nothing chosen by hand.'
    )
    print(
        f'- **{counts["override"]} overridden** -- a judgement call, listed '
        'in `DISPLAY_OVERRIDES`. These are the ones worth arguing about.\n'
    )
    print('| Display name | Source polygons | km² | Rule |')
    print('| --- | --- | ---: | --- |')
    for shelf in shelves:
        sources = ', '.join(f'`{name}`' for name in shelf.source_names)
        rule = _naming_rule(shelf)
        emphasis = '**' if rule == 'override' else ''
        print(
            f'| {emphasis}{shelf.display}{emphasis} | {sources} | '
            f'{shelf.area_km2:,.0f} | {rule} |'
        )


def _run_names(args: argparse.Namespace) -> int:
    shelves = read_named_shelves(
        args.boundaries, min_area_km2=args.min_area_km2
    )
    if args.fragmented_only:
        shelves = [shelf for shelf in shelves if shelf.was_fragmented]

    if args.format == 'markdown':
        _print_markdown(shelves)
        return 0

    print(f'{len(shelves)} named shelves\n')
    print(f'{"display name":<26} {"dataset key":<24} {"area km2":>10}  parts')
    print('-' * 78)
    for shelf in shelves:
        parts = (
            ' <- ' + ', '.join(shelf.source_names)
            if shelf.was_fragmented
            else ''
        )
        print(
            f'{shelf.display:<26} {shelf.canonical:<24} '
            f'{shelf.area_km2:>10,.0f}{parts}'
        )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == 'outlines':
        return _run_outlines(args)
    if args.command == 'names':
        return _run_names(args)
    raise AssertionError(f'unhandled command {args.command!r}')


if __name__ == '__main__':
    raise SystemExit(main())
