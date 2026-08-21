from __future__ import annotations

import pytest

from wordie.names import DISPLAY_OVERRIDES, canonical_name, display_name


class TestCanonicalName:
    @pytest.mark.parametrize(
        'raw,expected',
        [
            ('Abbot_1', 'Abbot'),
            ('Abbot_6', 'Abbot'),
            ('Getz_2', 'Getz'),
            ('LarsenD_1', 'LarsenD'),
            ('Walgreen_Coast_1', 'Walgreen_Coast'),
            ('Rydberg_Peninsula_2', 'Rydberg_Peninsula'),
        ],
    )
    def test_strips_numbered_fragments(self, raw: str, expected: str) -> None:
        assert canonical_name(raw) == expected

    @pytest.mark.parametrize(
        'raw',
        [
            'Wordie_(Cape_Jeremy)',
            'Wordie_(Harriott)',
            'Wordie_(Harriott_Headland)',
            'Wordie_(Airy_Rotz_Seller)',
            'Wordie_(Prospect)',
        ],
    )
    def test_strips_parenthetical_fragments(self, raw: str) -> None:
        # The five pieces the game's namesake has been reduced to.
        assert canonical_name(raw) == 'Wordie'

    def test_joins_the_two_halves_of_ross(self) -> None:
        assert canonical_name('Ross_East') == 'Ross'
        assert canonical_name('Ross_West') == 'Ross'

    @pytest.mark.parametrize(
        'raw',
        [
            'Amery',
            'LarsenC',
            'Riiser-Larsen',
            'George_VI',
            'Pine_Island',
            'Brunt_Stancomb',
            'Conger_Glenzer',
            'Hayes_Coats_Coast',
        ],
    )
    def test_leaves_real_names_alone(self, raw: str) -> None:
        # Nothing here is a fragment, and an over-eager rule that trimmed
        # 'Riiser-Larsen' or the tail of a compound name would merge shelves
        # that have nothing to do with each other.
        assert canonical_name(raw) == raw

    def test_ignores_surrounding_whitespace(self) -> None:
        # The dBASE table pads its fields.
        assert canonical_name('  Abbot_2  ') == 'Abbot'


class TestDisplayName:
    @pytest.mark.parametrize(
        'canonical,expected',
        [
            ('LarsenC', 'Larsen C'),
            ('LarsenA', 'Larsen A'),
            ('HarbordGlacier', 'Harbord Glacier'),
            ('PourquoiPas', 'Pourquoi Pas'),
            ('CapeWashington', 'Cape Washington'),
            ('GeikieInlet', 'Geikie Inlet'),
            ('SmithInlet', 'Smith Inlet'),
            ('ClarkeBay', 'Clarke Bay'),
        ],
    )
    def test_splits_camel_case(self, canonical: str, expected: str) -> None:
        assert display_name(canonical) == expected

    @pytest.mark.parametrize(
        'canonical,expected',
        [
            ('Pine_Island', 'Pine Island'),
            ('Moscow_University', 'Moscow University'),
            ('Prince_Harald', 'Prince Harald'),
            ('Walgreen_Coast', 'Walgreen Coast'),
        ],
    )
    def test_replaces_underscores(self, canonical: str, expected: str) -> None:
        assert display_name(canonical) == expected

    def test_leaves_roman_numerals_whole(self) -> None:
        # An acronym rule that split runs of capitals would give 'George V I'.
        assert display_name('George_VI') == 'George VI'
        assert display_name('Edward_VIII') == 'Edward VIII'

    def test_keeps_patronymic_prefixes_together(self) -> None:
        # The lower-to-upper rule would otherwise give 'Mc Leod'.
        assert display_name('McLeod') == 'McLeod'

    @pytest.mark.parametrize(
        'canonical,expected',
        [
            ('Ekstrom', 'Ekström'),
            ('Nordenskjold', 'Nordenskjöld'),
            ('Zelee', 'Zélée'),
            ('Francais', 'Français'),
            ('Sorsdal', 'Sørsdal'),
        ],
    )
    def test_restores_diacritics_the_dbf_could_not_carry(
        self, canonical: str, expected: str
    ) -> None:
        assert display_name(canonical) == expected

    def test_overrides_win_over_the_mechanical_rules(self) -> None:
        assert display_name('Brunt_Stancomb') == 'Brunt–Stancomb-Wills'
        assert display_name('WilmaRobertDowner') == 'Wilma–Robert–Downer'

    def test_hyphenated_names_survive(self) -> None:
        assert display_name('Riiser-Larsen') == 'Riiser-Larsen'

    def test_every_override_key_is_already_canonical(self) -> None:
        # An override keyed on a fragment name would never be reached, because
        # display_name only ever sees canonical names.
        for key in DISPLAY_OVERRIDES:
            assert canonical_name(key) == key
