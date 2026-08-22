import './style.css';
import { createGame, matchingShelves, submitGuess, type Game } from './game';
import { puzzleNumber } from './daily';
import { dailyRound, practiceRound, type Mode, type Round } from './rounds';
import type { Difficulty } from './pool';
import { forgetOldGames, loadGame, saveGame } from './storage';
import { loadCollection, type ShelfFeature } from './shelves';
import { renderAbout } from './about';
import { drawWordmark } from './wordmark';
import { copyToClipboard, shareText } from './share';
import {
  clearSuggestions,
  renderMode,
  resetRound,
  drawOutline,
  findElements,
  renderGuesses,
  renderStatus,
  renderSuggestions,
  reportCopy,
  showError,
} from './ui';

const elements = findElements();

// Before anything is fetched: the mark does not depend on the outlines.
drawWordmark();

/**
 * Wire the about panel.
 *
 * Done as soon as the outlines arrive rather than on first open, so the
 * citations are in the page whether or not anybody presses the button.
 */
const showAbout = (
  sources: Parameters<typeof renderAbout>[1],
  note: string,
): void => {
  const dialog = document.querySelector<HTMLDialogElement>('#about');
  const open = document.querySelector<HTMLButtonElement>('#about-open');
  const container = document.querySelector<HTMLElement>('#about-sources');
  if (!dialog || !open || !container) return;

  renderAbout(container, sources, note);
  open.addEventListener('click', () => {
    dialog.showModal();
  });
  // Clicking the backdrop closes it. The dialog's own box is a child, so a
  // click landing on the element itself landed outside the content.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
};

const start = async (): Promise<void> => {
  if (!elements) return;

  const collection = await loadCollection();
  const shelves = collection.features;
  showAbout(collection.sources, collection.note);

  const today = new Date();
  const puzzle = puzzleNumber(today);
  const byKey = new Map(shelves.map((shelf) => [shelf.properties.key, shelf]));

  let mode: Mode = 'daily';
  let difficulty: Difficulty = 'major';
  let round: Round | null = null;
  let game: Game | null = null;

  const persist = (): void => {
    if (!round?.persist || !game) return;
    saveGame(puzzle, {
      answer: round.answer.properties.key,
      guesses: game.guesses.map((guess) => guess.key),
    });
  };

  const redraw = (): void => {
    if (!elements || !game) return;
    renderGuesses(elements, game);
    renderStatus(elements, game);
  };

  const begin = (next: Round): void => {
    if (!elements) return;
    round = next;
    game = createGame(next.answer);

    // Only a daily round has anything to restore; a practice round starts
    // fresh by definition. Replaying the saved guesses rather than restoring
    // the state they produced means a game resumed after a change to the
    // scoring comes back scored the new way.
    if (next.persist) {
      const saved = loadGame(puzzle, next.answer.properties.key);
      for (const key of saved?.guesses ?? []) {
        const shelf = byKey.get(key);
        if (shelf) game = submitGuess(game, shelf);
      }
    }

    resetRound(elements);
    drawOutline(elements, next.answer);
    redraw();
  };

  const play = (shelf: ShelfFeature): void => {
    if (!elements || !game) return;
    game = submitGuess(game, shelf);
    persist();
    elements.input.value = '';
    clearSuggestions(elements);
    redraw();
    if (game.status === 'playing') elements.input.focus();
  };

  const suggest = (): ShelfFeature[] => {
    if (!elements) return [];
    // Guessing is open across all 164 shelves whatever the answer was drawn
    // from: a wrong guess is only worth making if it can tell you where you
    // are.
    const matches = matchingShelves(shelves, elements.input.value);
    renderSuggestions(elements, matches, play);
    return matches;
  };

  const startDaily = (): void => {
    const next = dailyRound(shelves, today);
    if (!next) {
      showError(elements!, 'No ice shelves to play with.');
      return;
    }
    mode = 'daily';
    begin(next);
    renderMode(elements!, mode, difficulty);
  };

  const startPractice = (): void => {
    const next = practiceRound(
      shelves,
      difficulty,
      Math.random,
      round?.answer.properties.key,
    );
    if (!next) {
      showError(elements!, 'No ice shelves to play with.');
      return;
    }
    mode = 'practice';
    begin(next);
    renderMode(elements!, mode, difficulty);
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

  elements.share.addEventListener('click', () => {
    if (!game) return;
    const text = shareText(game, {
      puzzle,
      // Wherever this copy of the game is served from, so a pasted result
      // links back to the game rather than to a guess about where it lives.
      url: new URL(import.meta.env.BASE_URL, window.location.href).href,
    });
    void copyToClipboard(text).then((copied) => {
      reportCopy(elements!, copied);
    });
  });

  elements.daily.addEventListener('click', startDaily);
  elements.practice.addEventListener('click', startPractice);
  elements.hard.addEventListener('change', () => {
    difficulty = elements!.hard.checked ? 'all' : 'major';
    // Changing the pool mid-round would leave the shelf on screen belonging
    // to a set the player is no longer playing, so it deals a new one.
    if (mode === 'practice') startPractice();
    else renderMode(elements!, mode, difficulty);
  });

  startDaily();
  forgetOldGames(puzzle);
  elements.input.focus();
};

start().catch((error: unknown) => {
  if (!elements) return;
  showError(
    elements,
    error instanceof Error ? error.message : 'Something went wrong.',
  );
});
