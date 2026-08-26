// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drawOutline,
  findElements,
  renderChoices,
  renderMode,
  renderSky,
  renderStatus,
  type Elements,
} from './ui';
import { createGame, submitGuess, type Game } from './game';
import { EASY_CHOICES, EASY_GUESSES } from './pool';
import type { Round } from './rounds';
import type { ShelfFeature } from './shelves';

const shelf = (key: string, lon = 0): ShelfFeature => ({
  type: 'Feature',
  properties: {
    key,
    name: key,
    area_km2: 1000,
    lon,
    lat: -70,
    // A square of land off one side, as the pipeline would have traced it.
    context: {
      land: [
        [
          [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        ],
      ],
      ice: [],
    },
  },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ],
  },
});

const CHOICES = ['Amery', 'Getz', 'LarsenC', 'Ronne', 'Ross', 'Wordie'].map(
  (key, i) => shelf(key, i * 20 - 60),
);
const ANSWER = CHOICES[4] as ShelfFeature;

/** Enough of the page for the renderers to write into. */
const page = `
  <path id="outline"></path>
  <path id="context-land"></path>
  <path id="context-ice"></path>
  <p id="context-key" hidden><span id="key-ice" hidden></span></p>
  <p id="reveal"></p>
  <form id="guess-form"><input id="guess-input" /><ul id="suggestions"></ul></form>
  <ul id="choices"></ul>
  <p id="remaining"></p>
  <ol id="guesses"></ol>
  <p id="status"></p>
  <button id="share"></button>
  <button id="mode-daily"></button>
  <button id="mode-practice"></button>
  <div class="level-buttons">
    <button data-level="easy"></button>
    <button data-level="normal"></button>
    <button data-level="hard"></button>
  </div>`;

const easyRound = (): Round => ({
  answer: ANSWER,
  level: 'easy',
  choices: CHOICES,
  maxGuesses: EASY_GUESSES,
  persist: true,
});

const openRound = (): Round => ({
  answer: ANSWER,
  level: 'normal',
  choices: null,
  maxGuesses: 6,
  persist: true,
});

let elements: Elements;
const buttons = (): HTMLButtonElement[] => [
  ...elements.choices.querySelectorAll('button'),
];

beforeEach(() => {
  document.body.innerHTML = page;
  elements = findElements() as Elements;
  expect(elements).not.toBeNull();
});

describe('the surroundings under the outline', () => {
  it('are drawn on easy, with a key saying what they are', () => {
    drawOutline(elements, ANSWER, true);

    expect(elements.land.getAttribute('d')).toBeTruthy();
    expect(elements.contextKey.hidden).toBe(false);
  });

  it('name a neighbouring shelf only when there is one', () => {
    // Most shelves are a body of ice on their own, and a key entry for a
    // colour that is not on the page is a colour the player hunts for.
    drawOutline(elements, ANSWER, true);
    expect(elements.iceKey.hidden).toBe(true);

    const neighboured = shelf('Filchner');
    neighboured.properties.context = {
      land: [],
      ice: [
        [
          [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        ],
      ],
    };
    drawOutline(elements, neighboured, true);

    expect(elements.iceKey.hidden).toBe(false);
  });

  it('are left off at every other level', () => {
    // The hint is the level's, not the shelf's: the same outline is drawn
    // without it on normal and hard.
    drawOutline(elements, ANSWER, true);
    drawOutline(elements, ANSWER, false);

    expect(elements.land.getAttribute('d')).toBe('');
    expect(elements.ice.getAttribute('d')).toBe('');
    expect(elements.contextKey.hidden).toBe(true);
  });

  it('leave the outline itself alone either way', () => {
    drawOutline(elements, ANSWER, false);
    const plain = elements.outline.getAttribute('d');
    drawOutline(elements, ANSWER, true);

    expect(elements.outline.getAttribute('d')).toBe(plain);
  });
});

describe('the easy-mode choice list', () => {
  it('shows the names instead of the text input', () => {
    const game = createGame(ANSWER, EASY_GUESSES);
    renderChoices(elements, easyRound(), game, () => undefined);

    expect(elements.form.hidden).toBe(true);
    expect(buttons().map((b) => b.textContent)).toEqual(
      CHOICES.map((s) => s.properties.name),
    );
  });

  it('plays the name that was pressed', () => {
    const onPick = vi.fn();
    renderChoices(
      elements,
      easyRound(),
      createGame(ANSWER, EASY_GUESSES),
      onPick,
    );
    buttons()[1]?.click();
    expect(onPick).toHaveBeenCalledWith(CHOICES[1]);
  });

  it('leaves a spent name visible but dead', () => {
    // Removing it would take away the row the player is reading the distance
    // and arrow off, and hiding the miss is the opposite of the point.
    const game = submitGuess(
      createGame(ANSWER, EASY_GUESSES),
      CHOICES[0] as ShelfFeature,
    );
    renderChoices(elements, easyRound(), game, () => undefined);

    const spent = buttons()[0] as HTMLButtonElement;
    expect(spent.disabled).toBe(true);
    expect(spent.textContent).toBe('Amery');
    expect(buttons()[1]?.disabled).toBe(false);
  });

  it('closes the list and marks the answer once the round is over', () => {
    const lost = [CHOICES[0], CHOICES[1]].reduce(
      (game: Game, guess) => submitGuess(game, guess as ShelfFeature),
      createGame(ANSWER, EASY_GUESSES),
    );
    expect(lost.status).toBe('lost');
    renderChoices(elements, easyRound(), lost, () => undefined);

    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(
      buttons().filter((b) => b.classList.contains('answer')),
    ).toHaveLength(1);
    expect(
      buttons().find((b) => b.classList.contains('answer'))?.textContent,
    ).toBe(ANSWER.properties.name);
  });

  it('offers exactly as many names as easy mode promises', () => {
    renderChoices(
      elements,
      easyRound(),
      createGame(ANSWER, EASY_GUESSES),
      () => undefined,
    );
    expect(buttons()).toHaveLength(EASY_CHOICES);
  });
});

describe('above easy', () => {
  it('leaves the text input in place and the list empty', () => {
    // `#choices:empty` is what keeps it out of the layout, so the list has to
    // actually be empty rather than merely hidden.
    renderChoices(elements, openRound(), createGame(ANSWER), () => undefined);
    expect(elements.form.hidden).toBe(false);
    expect(elements.choices.children).toHaveLength(0);
  });
});

describe('the share button', () => {
  it('appears when a daily round ends', () => {
    renderStatus(elements, submitGuess(createGame(ANSWER), ANSWER), true);
    expect(elements.share.hidden).toBe(false);
  });

  it('stays away when a practice round ends', () => {
    // A practice grid would go out stamped with today's puzzle number for a
    // shelf that was not today's.
    renderStatus(elements, submitGuess(createGame(ANSWER), ANSWER), false);
    expect(elements.share.hidden).toBe(true);
  });
});

describe('the level control', () => {
  const levelButton = (level: string): HTMLButtonElement =>
    elements.levels.find(
      (b) => b.dataset['level'] === level,
    ) as HTMLButtonElement;

  it('bars hard on the daily round and nothing else', () => {
    renderMode(elements, 'daily', 'normal');
    expect(levelButton('hard').disabled).toBe(true);
    expect(levelButton('easy').disabled).toBe(false);
    expect(levelButton('normal').disabled).toBe(false);
  });

  it('opens hard up in practice', () => {
    renderMode(elements, 'practice', 'normal');
    expect(levelButton('hard').disabled).toBe(false);
  });

  it('marks the level being played', () => {
    renderMode(elements, 'daily', 'easy');
    expect(levelButton('easy').getAttribute('aria-pressed')).toBe('true');
    expect(levelButton('normal').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the Halloween sky', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('is nowhere in the page until it is asked for', () => {
    // The whole point of building it in script: on the other 364 days there
    // is no moon in the markup for anyone to find early.
    expect(document.querySelector('#sky')).toBeNull();
  });

  it('hangs a moon and cloud behind the page', () => {
    renderSky(document.body);
    expect(document.querySelectorAll('#sky .moon')).toHaveLength(1);
    expect(document.querySelectorAll('#sky .cloud').length).toBeGreaterThan(0);
    // The styles hang off the class rather than off the element, so both have
    // to arrive together.
    expect(document.body.classList.contains('halloween')).toBe(true);
  });

  it('comes before the game and stays out of its way', () => {
    const app = document.createElement('main');
    document.body.append(app);
    renderSky(document.body);

    expect(document.body.firstElementChild?.id).toBe('sky');
    expect(document.querySelector('#sky')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('is built once, however many times it is asked for', () => {
    renderSky(document.body);
    renderSky(document.body);
    expect(document.querySelectorAll('#sky')).toHaveLength(1);
  });
});
