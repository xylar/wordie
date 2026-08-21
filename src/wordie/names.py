"""Turning MEaSUREs polygon names into shelf names, and then into labels.

Two separate steps, because they answer different questions.

`canonical_name` answers "which ice shelf is this polygon part of?". The
MEaSUREs boundaries carve several shelves into pieces -- Abbot into seven,
Wordie into five, Ross into an eastern and a western half -- and each piece
carries its own NAME. For a guessing game those have to come back together:
six answers all called Abbot would be a worse puzzle, not a harder one.

`display_name` answers "what should the player read?". The dataset writes
`LarsenC`, `Ekstrom` and `WilmaRobertDowner`, which are fine as keys and wrong
on screen.
"""

from __future__ import annotations

import re

#: Suffixes MEaSUREs uses when it splits one shelf across several polygons.
#: Numbers cover Abbot_1..6, Getz_1..2, LarsenD_1, Walgreen_Coast_1..2 and
#: Rydberg_Peninsula_1..2. East and West cover the two halves of Ross, and are
#: listed explicitly rather than as a general compass rule: this dataset has no
#: shelf whose real name ends in a direction, but plenty of places do.
_FRAGMENT_SUFFIX = re.compile(r'_(?:\d+|East|West)$')

#: The other way MEaSUREs splits a shelf: a parenthetical locality, as in
#: Wordie_(Cape_Jeremy) and Wordie_(Harriott_Headland).
_FRAGMENT_LOCALITY = re.compile(r'_\([^)]*\)$')

#: Names no mechanical rule gets right. Diacritics that the shapefile's dBASE
#: table could not carry, and compound shelves whose usual written form is not
#: recoverable from the key.
DISPLAY_OVERRIDES: dict[str, str] = {
    # Diacritics stripped by the source encoding.
    'Ekstrom': 'Ekström',
    'Nordenskjold': 'Nordenskjöld',
    'Zelee': 'Zélée',
    'Francais': 'Français',
    'Sorsdal': 'Sørsdal',
    # Names the dataset gives in a shorter form than the one in common use.
    # 'isen' is Norwegian for the ice shelf itself, so Fimbul and Nivl are the
    # features and Fimbulisen and Nivlisen are what gets written.
    'Fimbul': 'Fimbulisen',
    'Nivl': 'Nivlisen',
    # Named for Baudouin, King of the Belgians, and written in French.
    'Baudouin': 'Roi Baudouin',
    # Compound shelves, written as a list of the parts they join. Joined with
    # a plain hyphen rather than an en dash, to match Riiser-Larsen, which
    # arrives hyphenated from the dataset itself.
    'Brunt_Stancomb': 'Brunt-Stancomb',
    'WilmaRobertDowner': 'Wilma-Robert-Downer',
    'Rayner_Thyer': 'Rayner-Thyer',
    'Conger_Glenzer': 'Conger-Glenzer',
    'Dawson_Lambton': 'Dawson-Lambton',
    'Tracy_Tremenchus': 'Tracy-Tremenchus',
}

#: Insert a space between a lower-case letter and the upper-case letter that
#: follows it: LarsenC, HarbordGlacier, PourquoiPas. The lookbehinds spare the
#: Scottish and Irish patronymic prefixes, without which McLeod becomes
#: 'Mc Leod'.
_LOWER_THEN_UPPER = re.compile(r'(?<=[a-z])(?<!Mc)(?<!Mac)(?=[A-Z])')

#: Insert a space between a run of capitals and a following capitalised word,
#: so that an acronym does not swallow the word after it. Written so that
#: roman numerals such as VI and VIII, which are never followed by a
#: lower-case letter, come through untouched.
_UPPER_RUN_THEN_WORD = re.compile(r'(?<=[A-Z])(?=[A-Z][a-z])')


def canonical_name(raw_name: str) -> str:
    """Reduce a MEaSUREs polygon name to the shelf it belongs to.

    >>> canonical_name('Abbot_3')
    'Abbot'
    >>> canonical_name('Wordie_(Cape_Jeremy)')
    'Wordie'
    >>> canonical_name('Ross_East')
    'Ross'
    >>> canonical_name('LarsenC')
    'LarsenC'
    """
    name = raw_name.strip()
    name = _FRAGMENT_LOCALITY.sub('', name)
    return _FRAGMENT_SUFFIX.sub('', name)


def display_name(canonical: str) -> str:
    """Render a canonical shelf name as the player should read it.

    >>> display_name('LarsenC')
    'Larsen C'
    >>> display_name('Pine_Island')
    'Pine Island'
    >>> display_name('George_VI')
    'George VI'
    >>> display_name('Ekstrom')
    'Ekström'
    """
    if canonical in DISPLAY_OVERRIDES:
        return DISPLAY_OVERRIDES[canonical]
    spaced = canonical.replace('_', ' ')
    spaced = _LOWER_THEN_UPPER.sub(' ', spaced)
    spaced = _UPPER_RUN_THEN_WORD.sub(' ', spaced)
    return ' '.join(spaced.split())
