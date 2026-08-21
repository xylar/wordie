"""Drawing the wordie logo from the outline of the Wordie Ice Shelf.

The mark is not a stylised drawing of an ice shelf. It is the Wordie Ice
Shelf, as the MEaSUREs boundaries record it: five fragments in a box 53 km
across, all that remains of a shelf that disintegrated from the 1960s onward
and was gone by 2004. The fragmentation is the design. A logo assembled from
the pieces of a collapsed shelf says what the project is about more honestly
than an intact one would, and it is drawn from the same file the game's
answers come from, so it cannot drift away from the data.

SVG is written directly rather than through a plotting library. A logo wants
exact control of the viewBox, no axes or margins to strip afterwards, a file
small enough to inline, and colours that can defer to the page around them --
none of which a chart renderer is built to give.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from wordie.projections import extent_of

#: The palette the game already uses, from web/src/style.css.
OCEAN = '#0b1d2a'
ICE = '#eaf4f8'
SHELF = '#cfe6f0'


@dataclass(frozen=True)
class LogoStyle:
    """How the mark is drawn."""

    #: Side of the square viewBox. Any value works -- the output is vector --
    #: but 256 keeps the coordinates readable in the file.
    size: float = 256.0
    #: Clear space around the shape, as a fraction of the side. Kept tight,
    #: because Wordie's fragments are strung out diagonally and fitting their
    #: bounding box already spends most of the square on empty water.
    padding: float = 0.06
    #: Draw only the N largest fragments, or None for all of them.
    #:
    #: All five is the truthful mark and what the logo uses. A favicon cannot
    #: afford it: at 16 px the five pieces come out as illegible specks, so
    #: that one variant falls back to Wordie's principal remnant -- still the
    #: real outline of the real shelf, just the largest surviving piece of it
    #: rather than all five.
    largest_fragments: int | None = None
    #: Fill for the ice. `currentColor` lets a page set it through CSS, so one
    #: file serves a light and a dark theme.
    fill: str = 'currentColor'
    #: Background, or None to leave it transparent.
    background: str | None = None
    #: Corner radius of the background, as a fraction of the side.
    background_radius: float = 0.0
    #: Coordinate precision. Two decimals on a 256 unit box is well under a
    #: pixel at any size the mark is used, and keeps the file small.
    precision: int = 2
    #: Wordmark: gap between the mark and the name, as a fraction of the side.
    wordmark_gap: float = 0.20
    #: Wordmark: type size, as a fraction of the side.
    wordmark_font_scale: float = 0.42
    #: Wordmark: width of the name in ems, used to size the canvas so that the
    #: right margin matches the left.
    #:
    #: SVG cannot measure text before it is rendered and the result depends on
    #: whichever font the viewer resolves from the stack, so this is measured
    #: once -- 'wordie' set at weight 600 in the stack below -- and then held
    #: to with `textLength`. Holding to it is the point: the canvas is sized
    #: from this number, so a viewer whose font is wider must not be allowed
    #: to overflow it.
    #:
    #: This is an advance width, which runs a few units past the last glyph's
    #: ink by that glyph's right side bearing. The drawn right margin is
    #: therefore a shade wider than the left -- about 5 units in 674 on the
    #: reference font. Chasing that out would mean a second font-specific
    #: constant to measure and maintain for a difference nobody can see.
    text_width_em: float = 3.408
    title: str = 'wordie'
    description: str = (
        'The five surviving fragments of the Wordie Ice Shelf, '
        'Antarctic Peninsula'
    )


@dataclass(frozen=True)
class _Frame:
    """Maps map-plane metres onto the square viewBox."""

    scale: float
    offset_x: float
    offset_y: float
    size: float

    def project(self, x: float, y: float) -> tuple[float, float]:
        # SVG's y axis runs downwards and the map's runs north, so y is
        # flipped here. Without it the logo comes out upside down, which on a
        # shape this irregular is not obvious until it is next to a map.
        return (
            (x - self.offset_x) * self.scale,
            self.size - (y - self.offset_y) * self.scale,
        )


def _frame_for(geometry: BaseGeometry, style: LogoStyle) -> _Frame:
    """Fit a geometry inside the viewBox, centred, aspect preserved."""
    min_x, min_y, _max_x, _max_y = geometry.bounds
    width, height = extent_of(geometry)

    usable = style.size * (1.0 - 2.0 * style.padding)
    scale = usable / max(width, height)
    # Centre the shorter axis so the mark sits in the middle of the square.
    slack_x = (style.size - width * scale) / 2.0
    slack_y = (style.size - height * scale) / 2.0
    return _Frame(
        scale=scale,
        offset_x=min_x - slack_x / scale,
        offset_y=min_y - slack_y / scale,
        size=style.size,
    )


def _ring_path(
    coords: list[tuple[float, float]], frame: _Frame, precision: int
) -> str:
    points = [frame.project(x, y) for x, y in coords]
    # A closed ring repeats its first point; `Z` closes it instead.
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    head = points[0]
    parts = [f'M{head[0]:.{precision}f},{head[1]:.{precision}f}']
    parts += [f'L{x:.{precision}f},{y:.{precision}f}' for x, y in points[1:]]
    return ''.join(parts) + 'Z'


def _polygon_path(polygon: Polygon, frame: _Frame, precision: int) -> str:
    rings = [_ring_path(list(polygon.exterior.coords), frame, precision)]
    # Interior rings are drawn in the same path, which the default even-odd
    # winding renders as holes. Wordie has none left, but Larsen C would.
    rings += [
        _ring_path(list(interior.coords), frame, precision)
        for interior in polygon.interiors
    ]
    return ''.join(rings)


def _polygons(geometry: BaseGeometry) -> list[Polygon]:
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, Polygon):
        return [geometry]
    raise TypeError(f'cannot draw a {geometry.geom_type}')


def _selected_polygons(
    geometry: BaseGeometry, style: LogoStyle
) -> list[Polygon]:
    """The polygons to draw, largest first.

    Sorted so that a variant asking for fewer keeps the pieces that carry the
    silhouette rather than an arbitrary subset.
    """
    polygons = sorted(_polygons(geometry), key=lambda p: -p.area)
    if style.largest_fragments is not None:
        polygons = polygons[: style.largest_fragments]
    if not polygons:
        raise ValueError('nothing left to draw')
    return polygons


def _extent_of(polygons: list[Polygon]) -> BaseGeometry:
    """Frame the pieces actually drawn, not the ones discarded."""
    return MultiPolygon(polygons) if len(polygons) > 1 else polygons[0]


def render_mark(geometry: BaseGeometry, style: LogoStyle | None = None) -> str:
    """Render a geometry as a standalone square SVG."""
    style = style or LogoStyle()
    polygons = _selected_polygons(geometry, style)
    frame = _frame_for(_extent_of(polygons), style)
    path = ' '.join(
        _polygon_path(polygon, frame, style.precision) for polygon in polygons
    )

    size = f'{style.size:g}'
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
        'role="img" aria-labelledby="logo-title logo-desc">',
        f'  <title id="logo-title">{style.title}</title>',
        f'  <desc id="logo-desc">{style.description}</desc>',
    ]
    if style.background is not None:
        radius = style.background_radius * style.size
        lines.append(
            f'  <rect width="{size}" height="{size}" '
            f'rx="{radius:g}" ry="{radius:g}" fill="{style.background}"/>'
        )
    lines.append(f'  <path d="{path}" fill="{style.fill}"/>')
    lines.append('</svg>')
    return '\n'.join(lines) + '\n'


def render_wordmark(
    geometry: BaseGeometry,
    style: LogoStyle | None = None,
    text: str = 'wordie',
) -> str:
    """Render the mark beside the project name, as a wide SVG.

    The name is set as `<text>`, not converted to outlines, so it stays
    editable and needs no font tooling to regenerate. The trade is that a
    machine without the font stack falls back to whatever it has; for a
    project logo shown in a README that is the better bargain.
    """
    style = style or LogoStyle()
    mark_size = style.size
    polygons = _selected_polygons(geometry, style)
    extent = _extent_of(polygons)
    frame = _frame_for(extent, style)
    path = ' '.join(
        _polygon_path(polygon, frame, style.precision) for polygon in polygons
    )

    # Lay the canvas out from where the ink actually falls rather than from a
    # fixed multiple of the mark. Wordie's fragments do not fill their square
    # -- the shape is taller than it is wide, so framing it leaves slack at
    # both sides -- and a fixed canvas turns whatever the name does not use
    # into a slab of dead space on the right.
    min_x, min_y, max_x, max_y = extent.bounds
    ink_left, _lower = frame.project(min_x, min_y)
    ink_right, _upper = frame.project(max_x, max_y)

    font_size = mark_size * style.wordmark_font_scale
    text_width = font_size * style.text_width_em
    text_x = ink_right + mark_size * style.wordmark_gap
    # The same clear space on the right as the mark leaves on the left.
    width = text_x + text_width + ink_left

    baseline = mark_size * 0.63
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width:.{style.precision}f} {mark_size:g}" '
        f'width="{width:.{style.precision}f}" height="{mark_size:g}" '
        'role="img" aria-labelledby="logo-title logo-desc">',
        f'  <title id="logo-title">{style.title}</title>',
        f'  <desc id="logo-desc">{style.description}</desc>',
    ]
    if style.background is not None:
        lines.append(
            f'  <rect width="{width:.{style.precision}f}" '
            f'height="{mark_size:g}" fill="{style.background}"/>'
        )
    lines += [
        f'  <path d="{path}" fill="{style.fill}"/>',
        f'  <text x="{text_x:.{style.precision}f}" y="{baseline:g}" '
        f'font-family="system-ui, -apple-system, Segoe UI, sans-serif" '
        f'font-size="{font_size:g}" font-weight="600" '
        # textLength pins the name to the width the canvas was sized for.
        # lengthAdjust stays at its default of `spacing`, so a font that
        # differs from the measured one is re-tracked rather than having its
        # letterforms stretched.
        f'textLength="{text_width:.{style.precision}f}" '
        f'fill="{style.fill}">{text}</text>',
        '</svg>',
    ]
    return '\n'.join(lines) + '\n'


@dataclass(frozen=True)
class LogoSet:
    """The files `wordie-data logo` writes."""

    directory: Path
    written: list[Path] = field(default_factory=list)


def write_logo_set(geometry: BaseGeometry, directory: Path) -> LogoSet:
    """Write the mark, the wordmark and a favicon into `directory`."""
    directory.mkdir(parents=True, exist_ok=True)
    outputs = {
        # Theme-aware: inherits colour from the page it sits in.
        'logo.svg': render_mark(geometry),
        'logo-wordmark.svg': render_wordmark(geometry),
        # The same wordmark with its colours written down, for the two places
        # that cannot supply one. An <img> does not pass `currentColor` into
        # the file it loads, and a README is rendered by GitHub against a
        # background this repository does not choose -- where `currentColor`
        # resolves to black and the mark disappears into a dark theme.
        'banner.svg': render_wordmark(
            geometry, LogoStyle(fill=SHELF, background=OCEAN)
        ),
        # Favicons are shown against browser chrome of unknown colour, so this
        # one carries its own ground rather than inheriting one.
        'favicon.svg': render_mark(
            geometry,
            LogoStyle(
                size=64.0,
                padding=0.14,
                fill=SHELF,
                background=OCEAN,
                background_radius=0.15,
                largest_fragments=1,
                description=(
                    'The principal surviving fragment of the Wordie Ice '
                    'Shelf, Antarctic Peninsula'
                ),
            ),
        ),
    }
    written = []
    for name, svg in outputs.items():
        path = directory / name
        path.write_text(svg, encoding='utf-8')
        written.append(path)
    return LogoSet(directory=directory, written=written)
