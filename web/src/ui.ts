/**
 * Drawing the game. Everything here reads state and writes to the page;
 * nothing here decides anything, which is `game.ts`'s job.
 */

import type { Game, GuessResult } from './game';
import { guessesRemaining } from './game';
import type { Level } from './pool';
import type { Round } from './rounds';
import { contextPaths, outlinePath, type ShelfFeature } from './shelves';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Elements {
  outline: SVGPathElement;
  /** Easy mode's surroundings: what the shelf is pinned to, and the ice
   * next door. Open water is the frame's own ground. */
  land: SVGPathElement;
  ice: SVGPathElement;
  contextKey: HTMLElement;
  /** The third entry in the key, for the shelves that have a neighbour. */
  iceKey: HTMLElement;
  reveal: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  suggestions: HTMLUListElement;
  choices: HTMLUListElement;
  remaining: HTMLElement;
  guesses: HTMLOListElement;
  status: HTMLElement;
  share: HTMLButtonElement;
  daily: HTMLButtonElement;
  practice: HTMLButtonElement;
  levels: HTMLButtonElement[];
}

export const findElements = (): Elements | null => {
  const outline = document.querySelector<SVGPathElement>('#outline');
  const land = document.querySelector<SVGPathElement>('#context-land');
  const ice = document.querySelector<SVGPathElement>('#context-ice');
  const contextKey = document.querySelector<HTMLElement>('#context-key');
  const iceKey = document.querySelector<HTMLElement>('#key-ice');
  const reveal = document.querySelector<HTMLElement>('#reveal');
  const form = document.querySelector<HTMLFormElement>('#guess-form');
  const input = document.querySelector<HTMLInputElement>('#guess-input');
  const suggestions = document.querySelector<HTMLUListElement>('#suggestions');
  const choices = document.querySelector<HTMLUListElement>('#choices');
  const remaining = document.querySelector<HTMLElement>('#remaining');
  const guesses = document.querySelector<HTMLOListElement>('#guesses');
  const status = document.querySelector<HTMLElement>('#status');
  const share = document.querySelector<HTMLButtonElement>('#share');
  const daily = document.querySelector<HTMLButtonElement>('#mode-daily');
  const practice = document.querySelector<HTMLButtonElement>('#mode-practice');
  const levels = [
    ...document.querySelectorAll<HTMLButtonElement>('.level-buttons button'),
  ];
  if (
    !outline ||
    !land ||
    !ice ||
    !contextKey ||
    !iceKey ||
    !reveal ||
    !form ||
    !input ||
    !suggestions ||
    !choices ||
    !remaining ||
    !guesses ||
    !status ||
    !share ||
    !daily ||
    !practice ||
    levels.length === 0
  ) {
    return null;
  }
  return {
    outline,
    land,
    ice,
    contextKey,
    iceKey,
    reveal,
    form,
    input,
    suggestions,
    choices,
    remaining,
    guesses,
    status,
    share,
    daily,
    practice,
    levels,
  };
};

/**
 * Draw the shelf, and on easy the world around it.
 *
 * `context` is what the level asks for, not what the shelf has. A payload
 * built without the mask carries no surroundings at all and the paths come
 * back empty; nothing here needs to know that, because an empty path draws
 * nothing and the key is hidden along with it.
 */
export const drawOutline = (
  elements: Elements,
  shelf: ShelfFeature,
  context = false,
): void => {
  elements.outline.setAttribute('d', outlinePath(shelf));

  const drawn = context ? contextPaths(shelf) : { land: '', ice: '' };
  elements.land.setAttribute('d', drawn.land);
  elements.ice.setAttribute('d', drawn.ice);
  elements.contextKey.hidden = !(drawn.land || drawn.ice);
  // Named only when there is one to name. Most shelves are a body of ice on
  // their own, and a key entry for a colour not on the page is a colour the
  // player goes looking for.
  elements.iceKey.hidden = !drawn.ice;
};

const formatDistance = (km: number): string =>
  km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`;

const guessRow = (result: GuessResult): HTMLLIElement => {
  const row = document.createElement('li');
  row.className = result.correct ? 'guess correct' : 'guess';

  const name = document.createElement('span');
  name.className = 'guess-name';
  name.textContent = result.name;

  const distance = document.createElement('span');
  distance.className = 'guess-distance';
  distance.textContent = result.correct
    ? '—'
    : formatDistance(result.distanceKm);

  const arrow = document.createElement('span');
  arrow.className = 'guess-arrow';
  arrow.textContent = result.arrow;
  // The arrow is decoration over a bearing the screen reader should hear.
  arrow.setAttribute(
    'aria-label',
    result.correct
      ? 'correct'
      : `bearing ${Math.round(result.bearingDeg)} degrees on the map`,
  );

  const proximity = document.createElement('span');
  proximity.className = 'guess-proximity';
  proximity.textContent = `${Math.round(result.proximity * 100)}%`;

  row.append(name, distance, arrow, proximity);
  return row;
};

export const renderGuesses = (elements: Elements, game: Game): void => {
  elements.guesses.replaceChildren(...game.guesses.map(guessRow));
};

/**
 * `sharable` is a daily round. A practice result has no puzzle number that
 * means anything -- the grid would go out stamped with today's number for a
 * shelf that was not today's -- so practice offers no copy button at all.
 */
export const renderStatus = (
  elements: Elements,
  game: Game,
  sharable: boolean,
): void => {
  const left = guessesRemaining(game);
  const answer = game.answer.properties.name;

  if (game.status === 'playing') {
    elements.remaining.textContent = `${left} ${
      left === 1 ? 'guess' : 'guesses'
    } left`;
    elements.status.textContent = '';
    elements.reveal.textContent = '';
    return;
  }

  elements.remaining.textContent = '';
  elements.reveal.textContent = answer;
  elements.input.disabled = true;
  elements.suggestions.replaceChildren();
  elements.share.hidden = !sharable;
  elements.status.textContent =
    game.status === 'won'
      ? `${answer}, in ${game.guesses.length} ${
          game.guesses.length === 1 ? 'guess' : 'guesses'
        }.`
      : `Out of guesses. It was ${answer}.`;
};

export const renderSuggestions = (
  elements: Elements,
  matches: ShelfFeature[],
  onPick: (shelf: ShelfFeature) => void,
): void => {
  elements.suggestions.replaceChildren(
    ...matches.map((shelf) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = shelf.properties.name;
      button.addEventListener('click', () => onPick(shelf));
      item.append(button);
      return item;
    }),
  );
};

/**
 * The closed list's six names, as buttons.
 *
 * Rendered from scratch each time rather than having their disabled state
 * toggled, so that the list on the page is always exactly what the round and
 * the game say it should be. Six buttons is not a redraw worth optimising.
 *
 * A name already guessed stays visible but goes dead: removing it would take
 * away the row the player is reading the distance and arrow off, and hiding
 * the miss is the opposite of what the mode is for.
 */
export const renderChoices = (
  elements: Elements,
  round: Round,
  game: Game,
  onPick: (shelf: ShelfFeature) => void,
): void => {
  // Open guessing: the text input does the work, and the list stays empty so
  // that `#choices:empty` keeps it out of the layout entirely.
  if (!round.choices) {
    elements.choices.replaceChildren();
    elements.form.hidden = false;
    return;
  }

  elements.form.hidden = true;
  const spent = new Set(game.guesses.map((guess) => guess.key));
  elements.choices.replaceChildren(
    ...round.choices.map((shelf) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = shelf.properties.name;
      button.disabled =
        game.status !== 'playing' || spent.has(shelf.properties.key);
      if (spent.has(shelf.properties.key)) button.classList.add('spent');
      if (
        game.status !== 'playing' &&
        shelf.properties.key === game.answer.properties.key
      ) {
        button.classList.add('answer');
      }
      button.addEventListener('click', () => onPick(shelf));
      item.append(button);
      return item;
    }),
  );
};

/**
 * Say what the share button did.
 *
 * The label goes back after a moment rather than staying changed, so a second
 * copy is still obviously a button and not a completed thing.
 */
export const reportCopy = (
  elements: Elements,
  copied: boolean,
  restoreAfterMs = 1800,
): void => {
  const original = 'Copy result';
  elements.share.textContent = copied ? 'Copied' : 'Press Ctrl+C';
  window.setTimeout(() => {
    elements.share.textContent = original;
  }, restoreAfterMs);
};

/** Clear the page down for a new round. */
export const resetRound = (elements: Elements): void => {
  elements.guesses.replaceChildren();
  elements.suggestions.replaceChildren();
  elements.choices.replaceChildren();
  elements.status.textContent = '';
  elements.reveal.textContent = '';
  elements.input.value = '';
  elements.input.disabled = false;
  elements.share.hidden = true;
};

const LEVEL_TITLES: Record<Level, string> = {
  easy: 'Six names, two guesses, and the shelf drawn in its surroundings.',
  medium: 'Six names to choose from, and two guesses.',
  hard: 'Six guesses at any of the 164 named shelves.',
  insane: 'Draw practice shelves from all 164 named shelves.',
};

/**
 * Show which puzzle is being played, and at what level.
 *
 * Insane is disabled rather than hidden while the daily round is on, because
 * it does nothing there: the day's shelf always comes from the everyday pool,
 * so that everyone is playing the same puzzle. A control that silently did
 * nothing would be worse than one visibly switched off.
 *
 * The other three stay live on the daily. None of them changes which shelf
 * the day gets, only how much help there is in naming it.
 */
export const renderMode = (
  elements: Elements,
  mode: 'daily' | 'practice',
  level: Level,
): void => {
  elements.daily.classList.toggle('selected', mode === 'daily');
  elements.practice.classList.toggle('selected', mode === 'practice');
  elements.daily.setAttribute('aria-pressed', String(mode === 'daily'));
  elements.practice.setAttribute('aria-pressed', String(mode === 'practice'));
  elements.practice.textContent =
    mode === 'practice' ? 'New shelf' : 'Practice';

  for (const button of elements.levels) {
    const its = button.dataset['level'] as Level;
    const barred = its === 'insane' && mode === 'daily';
    button.classList.toggle('selected', its === level);
    button.setAttribute('aria-pressed', String(its === level));
    button.disabled = barred;
    button.title = barred
      ? 'Today’s shelf always comes from the everyday set, so everyone plays the same puzzle.'
      : LEVEL_TITLES[its];
  }
};

/**
 * Hang a full moon behind the page, with cloud drifting across it.
 *
 * Built here rather than kept hidden in `index.html`, so that on the other
 * 364 days of the year none of it is in the document: no moon to be found in
 * the markup by anyone poking at the page before the day, which is most of
 * what makes an easter egg worth having.
 *
 * The moon and the cloud are shapes made of gradients rather than an image.
 * They are the only art in the game that was not derived from the data, and
 * an SVG of a moon in `assets/` would sit next to outlines that were all
 * traced by a pipeline, inviting the question of which of the two the shelves
 * are.
 */
export const renderSky = (root: HTMLElement): void => {
  if (root.querySelector('#sky')) return;
  const doc = root.ownerDocument;

  const sky = doc.createElement('div');
  sky.id = 'sky';
  // Decoration with nothing to say. The puzzle is the outline; a screen
  // reader announcing scenery would only be in the way of it.
  sky.setAttribute('aria-hidden', 'true');

  const moon = doc.createElement('div');
  moon.className = 'moon';
  sky.append(moon);

  // Three, at different heights and speeds. One is enough for the picture the
  // day asks for; the others give the sky a depth that a single band crossing
  // an empty background does not.
  for (const index of [1, 2, 3]) {
    const cloud = doc.createElement('div');
    cloud.className = `cloud cloud-${index}`;
    sky.append(cloud);
  }

  // Behind everything, and first in the document so that nothing focusable
  // comes before the game.
  root.prepend(sky);
  root.classList.add('halloween');
};

export const clearSuggestions = (elements: Elements): void => {
  elements.suggestions.replaceChildren();
};

/** A blank outline, for before anything has loaded. */
export const clearOutline = (elements: Elements): void => {
  elements.outline.removeAttribute('d');
  elements.land.removeAttribute('d');
  elements.ice.removeAttribute('d');
  elements.contextKey.hidden = true;
  elements.iceKey.hidden = true;
};

export const showError = (elements: Elements, message: string): void => {
  elements.status.textContent = message;
};

export { SVG_NS };
