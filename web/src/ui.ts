/**
 * Drawing the game. Everything here reads state and writes to the page;
 * nothing here decides anything, which is `game.ts`'s job.
 */

import type { Game, GuessResult } from './game';
import { guessesRemaining } from './game';
import { outlinePath, type ShelfFeature } from './shelves';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Elements {
  outline: SVGPathElement;
  reveal: HTMLElement;
  input: HTMLInputElement;
  suggestions: HTMLUListElement;
  remaining: HTMLElement;
  guesses: HTMLOListElement;
  status: HTMLElement;
}

export const findElements = (): Elements | null => {
  const outline = document.querySelector<SVGPathElement>('#outline');
  const reveal = document.querySelector<HTMLElement>('#reveal');
  const input = document.querySelector<HTMLInputElement>('#guess-input');
  const suggestions = document.querySelector<HTMLUListElement>('#suggestions');
  const remaining = document.querySelector<HTMLElement>('#remaining');
  const guesses = document.querySelector<HTMLOListElement>('#guesses');
  const status = document.querySelector<HTMLElement>('#status');
  if (
    !outline ||
    !reveal ||
    !input ||
    !suggestions ||
    !remaining ||
    !guesses ||
    !status
  ) {
    return null;
  }
  return { outline, reveal, input, suggestions, remaining, guesses, status };
};

export const drawOutline = (elements: Elements, shelf: ShelfFeature): void => {
  elements.outline.setAttribute('d', outlinePath(shelf));
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

export const renderStatus = (elements: Elements, game: Game): void => {
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

export const clearSuggestions = (elements: Elements): void => {
  elements.suggestions.replaceChildren();
};

/** A blank outline, for before anything has loaded. */
export const clearOutline = (elements: Elements): void => {
  elements.outline.removeAttribute('d');
};

export const showError = (elements: Elements, message: string): void => {
  elements.status.textContent = message;
};

export { SVG_NS };
