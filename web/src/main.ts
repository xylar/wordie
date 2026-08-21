import './style.css';
import { createGame, matchingShelves, submitGuess, type Game } from './game';
import { shelfForDate } from './daily';
import { answerPool } from './pool';
import { loadShelves, type ShelfFeature } from './shelves';
import {
  clearSuggestions,
  drawOutline,
  findElements,
  renderGuesses,
  renderStatus,
  renderSuggestions,
  showError,
} from './ui';

const elements = findElements();

const start = async (): Promise<void> => {
  if (!elements) return;

  const shelves = await loadShelves();
  const answer = shelfForDate(answerPool(shelves), new Date());
  if (!answer) {
    showError(elements, 'No ice shelves to play with.');
    return;
  }

  let game: Game = createGame(answer);
  drawOutline(elements, answer);
  renderStatus(elements, game);

  const play = (shelf: ShelfFeature): void => {
    game = submitGuess(game, shelf);
    elements.input.value = '';
    clearSuggestions(elements);
    renderGuesses(elements, game);
    renderStatus(elements, game);
    if (game.status === 'playing') elements.input.focus();
  };

  const suggest = (): ShelfFeature[] => {
    // Guessing is open across all 164 shelves even though the answer comes
    // from the everyday pool: a wrong guess is only worth making if it can
    // tell you where you are.
    const matches = matchingShelves(shelves, elements.input.value);
    renderSuggestions(elements, matches, play);
    return matches;
  };

  elements.input.addEventListener('input', suggest);

  const form = document.querySelector<HTMLFormElement>('#guess-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    // Enter takes the first match, so a name can be played without reaching
    // for the mouse.
    const first = suggest()[0];
    if (first) play(first);
  });

  elements.input.focus();
};

start().catch((error: unknown) => {
  if (!elements) return;
  showError(
    elements,
    error instanceof Error ? error.message : 'Something went wrong.',
  );
});
