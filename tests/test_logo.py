from __future__ import annotations

import re
from pathlib import Path

import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from wordie.logo import (
    LogoStyle,
    _frame_for,
    render_mark,
    render_wordmark,
    write_logo_set,
)

#: Two squares, one four times the area of the other, arranged the way
#: Wordie's fragments are: apart, and on a diagonal.
SMALL = box(0.0, 0.0, 1.0e3, 1.0e3)
LARGE = box(5.0e3, 5.0e3, 7.0e3, 7.0e3)
SCATTERED = MultiPolygon([SMALL, LARGE])


def _paths(svg: str) -> list[str]:
    return re.findall(r'<path d="([^"]+)"', svg)


def _viewbox(svg: str) -> tuple[float, float]:
    match = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    assert match is not None
    return float(match.group(1)), float(match.group(2))


def _coords(svg: str) -> list[tuple[float, float]]:
    return [
        (float(x), float(y))
        for x, y in re.findall(r'[ML](-?[\d.]+),(-?[\d.]+)', svg)
    ]


class TestOrientation:
    def test_north_is_up(self) -> None:
        # SVG's y axis runs downwards and the map's runs north, so the
        # projection has to flip. Without the flip the logo comes out upside
        # down, which on a shape this irregular is not obvious by eye.
        northern = box(0.0, 9.0e3, 1.0e3, 1.0e4)
        southern = box(0.0, 0.0, 1.0e3, 1.0e3)
        svg = render_mark(MultiPolygon([northern, southern]))

        ys = [y for _x, y in _coords(svg)]
        # Smaller SVG y means higher on the page.
        assert min(ys) < max(ys)

        northern_only = _coords(render_mark(northern))
        southern_only = _coords(render_mark(southern))
        # Framed alone each fills the box, so compare within one drawing.
        assert len(northern_only) == len(southern_only)

    def test_a_northern_piece_sits_above_a_southern_one(self) -> None:
        northern = box(0.0, 9.0e3, 1.0e3, 1.0e4)
        southern = box(0.0, 0.0, 1.0e3, 1.0e3)
        svg = render_mark(MultiPolygon([northern, southern]))
        subpaths = _paths(svg)[0].split('Z')

        tops = [
            min(
                float(y)
                for _x, y in re.findall(r'[ML](-?[\d.]+),(-?[\d.]+)', subpath)
            )
            for subpath in subpaths
            if subpath.strip()
        ]
        assert len(tops) == 2
        assert min(tops) < max(tops)


class TestFraming:
    def test_does_not_distort_the_shape(self) -> None:
        # A shelf stretched to fill a square would be a lie about its outline,
        # and this audience compares shapes for a living.
        wide = box(0.0, 0.0, 4.0e3, 1.0e3)
        svg = render_mark(wide)
        coords = _coords(svg)

        width = max(x for x, _y in coords) - min(x for x, _y in coords)
        height = max(y for _x, y in coords) - min(y for _x, y in coords)
        assert width / height == pytest.approx(4.0, rel=1e-3)

    def test_keeps_everything_inside_the_viewbox(self) -> None:
        style = LogoStyle(size=256.0, padding=0.06)
        coords = _coords(render_mark(SCATTERED, style))

        assert min(x for x, _y in coords) >= 0.0
        assert min(y for _x, y in coords) >= 0.0
        assert max(x for x, _y in coords) <= style.size
        assert max(y for _x, y in coords) <= style.size

    def test_honours_the_padding(self) -> None:
        style = LogoStyle(size=100.0, padding=0.20)
        coords = _coords(render_mark(box(0.0, 0.0, 1.0e3, 1.0e3), style))

        assert min(x for x, _y in coords) == pytest.approx(20.0, abs=0.5)
        assert max(x for x, _y in coords) == pytest.approx(80.0, abs=0.5)

    def test_centres_the_shorter_axis(self) -> None:
        style = LogoStyle(size=100.0, padding=0.0)
        coords = _coords(render_mark(box(0.0, 0.0, 1.0e3, 5.0e2), style))

        top = min(y for _x, y in coords)
        bottom = max(y for _x, y in coords)
        assert top == pytest.approx(100.0 - bottom, abs=0.5)

    def test_rejects_a_shape_with_no_extent(self) -> None:
        with pytest.raises(ValueError, match='no extent'):
            _frame_for(Polygon(), LogoStyle())


class TestFragmentSelection:
    def test_draws_every_fragment_by_default(self) -> None:
        svg = render_mark(SCATTERED)
        assert svg.count('M') == 2

    def test_can_keep_only_the_largest(self) -> None:
        # What the favicon does: at 16 px all five of Wordie's pieces are
        # illegible specks, so that variant falls back to the principal one.
        svg = render_mark(SCATTERED, LogoStyle(largest_fragments=1))
        assert svg.count('M') == 1

    def test_the_kept_fragment_is_the_largest(self) -> None:
        style = LogoStyle(largest_fragments=1, padding=0.0, size=100.0)
        alone = _coords(render_mark(LARGE, style))
        chosen = _coords(render_mark(SCATTERED, style))
        assert sorted(chosen) == sorted(alone)

    def test_frames_what_it_draws_not_what_it_discarded(self) -> None:
        # If the frame were computed before selection, keeping one fragment of
        # a scattered set would leave it marooned in a corner.
        style = LogoStyle(largest_fragments=1, padding=0.0, size=100.0)
        coords = _coords(render_mark(SCATTERED, style))
        assert max(x for x, _y in coords) == pytest.approx(100.0, abs=0.5)


class TestHoles:
    def test_an_ice_rise_becomes_a_second_subpath(self) -> None:
        # Wordie has no rises left, but Larsen C would, and the even-odd
        # winding renders the inner ring as a hole.
        with_hole = box(0.0, 0.0, 1.0e3, 1.0e3).difference(
            box(4.0e2, 4.0e2, 6.0e2, 6.0e2)
        )
        svg = render_mark(with_hole)
        assert _paths(svg)[0].count('M') == 2


class TestSvgOutput:
    def test_is_a_standalone_svg_document(self) -> None:
        svg = render_mark(SCATTERED)
        assert svg.startswith('<svg xmlns="http://www.w3.org/2000/svg"')
        assert svg.rstrip().endswith('</svg>')

    def test_carries_a_title_and_description(self) -> None:
        svg = render_mark(SCATTERED)
        assert '<title id="logo-title">wordie</title>' in svg
        assert 'Wordie Ice Shelf' in svg
        assert 'aria-labelledby' in svg

    def test_defers_its_colour_to_the_page(self) -> None:
        # One file for a light and a dark theme.
        assert 'fill="currentColor"' in render_mark(SCATTERED)

    def test_background_is_absent_unless_asked_for(self) -> None:
        assert '<rect' not in render_mark(SCATTERED)
        assert '<rect' in render_mark(
            SCATTERED, LogoStyle(background='#0b1d2a')
        )

    def test_rounds_coordinates(self) -> None:
        svg = render_mark(SCATTERED, LogoStyle(precision=1))
        assert not re.search(r'\d\.\d\d', svg)

    def test_closes_every_ring(self) -> None:
        svg = render_mark(SCATTERED)
        assert svg.count('Z') == 2

    def test_refuses_geometry_it_cannot_draw(self) -> None:
        from shapely.geometry import LineString

        with pytest.raises(TypeError, match='LineString'):
            render_mark(LineString([(0.0, 0.0), (1.0, 1.0)]))


class TestWordmark:
    def test_sets_the_name_beside_the_mark(self) -> None:
        svg = render_wordmark(SCATTERED)
        assert '>wordie<' in svg

    def test_is_wider_than_it_is_tall(self) -> None:
        svg = render_wordmark(SCATTERED, LogoStyle(size=100.0))
        width, height = _viewbox(svg)
        assert width > height

    def test_right_margin_matches_the_left(self) -> None:
        # The canvas used to be a fixed four times the mark, which left
        # whatever the name did not use as a slab of dead space on the right.
        # It is now laid out from where the ink falls, and this pins that:
        # the space allowed after the name equals the space before the mark.
        style = LogoStyle(size=256.0)
        svg = render_wordmark(SCATTERED, style)
        width, _height = _viewbox(svg)

        left = min(x for x, _y in _coords(svg))
        text_x = float(re.search(r'<text x="([\d.]+)"', svg).group(1))
        text_length = float(re.search(r'textLength="([\d.]+)"', svg).group(1))

        assert width - (text_x + text_length) == pytest.approx(left, abs=0.05)

    def test_the_canvas_follows_the_length_of_the_name(self) -> None:
        narrow = render_wordmark(SCATTERED, LogoStyle(text_width_em=2.0))
        wide = render_wordmark(SCATTERED, LogoStyle(text_width_em=6.0))
        assert _viewbox(wide)[0] > _viewbox(narrow)[0]

    def test_pins_the_text_width_so_a_wider_font_cannot_overflow(
        self,
    ) -> None:
        # The canvas is sized from `text_width_em`, so the name has to be held
        # to it whatever font the viewer resolves.
        svg = render_wordmark(SCATTERED)
        assert 'textLength=' in svg
        # `spacing` is the default and is what we want -- a font that differs
        # gets re-tracked rather than having its letterforms stretched.
        assert 'lengthAdjust=' not in svg

    def test_the_name_can_be_changed(self) -> None:
        assert '>ice<' in render_wordmark(SCATTERED, text='ice')


class TestWriteLogoSet:
    def test_writes_the_three_files(self, tmp_path: Path) -> None:
        result = write_logo_set(SCATTERED, tmp_path / 'assets')

        names = {path.name for path in result.written}
        assert names == {'logo.svg', 'logo-wordmark.svg', 'favicon.svg'}
        for path in result.written:
            assert path.read_text().startswith('<svg')

    def test_the_favicon_carries_its_own_background(
        self, tmp_path: Path
    ) -> None:
        # It is shown against browser chrome of unknown colour, so it cannot
        # inherit one the way the in-page logo does.
        write_logo_set(SCATTERED, tmp_path)
        favicon = (tmp_path / 'favicon.svg').read_text()

        assert '<rect' in favicon
        assert 'currentColor' not in favicon
        assert favicon.count('M') == 1

    def test_creates_the_directory(self, tmp_path: Path) -> None:
        target = tmp_path / 'deep' / 'nested'
        write_logo_set(SCATTERED, target)
        assert (target / 'logo.svg').exists()
