import './style.css';
import { createGame, matchingShelves, submitGuess, type Game } from './game';
import { puzzleNumber, shelfForDate } from './daily';
import { forgetOldGames, loadGame, saveGame } from './storage';
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
  const today = new Date();
  const answer = shelfForDate(answerPool(shelves), today);
  if (!answer) {
    showError(elements, 'No ice shelves to play with.');
    return;
  }

  const puzzle = puzzleNumber(today);
  const byKey = new Map(shelves.map((shelf) => [shelf.properties.key, shelf]));

  let game: Game = createGame(answer);
  drawOutline(elements, answer);

  // Replay what was saved rather than restoring the state it produced, so a
  // game resumed after a change to the scoring comes back scored the new way.
  const saved = loadGame(puzzle, answer.properties.key);
  for (const key of saved?.guesses ?? []) {
    const shelf = byKey.get(key);
    if (shelf) game = submitGuess(game, shelf);
  }
  renderGuesses(elements, game);
  renderStatus(elements, game);
  forgetOldGames(puzzle);

  const play = (shelf: ShelfFeature): void => {
    game = submitGuess(game, shelf);
    saveGame(puzzle, {
      answer: answer.properties.key,
      guesses: game.guesses.map((guess) => guess.key),
    });
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
