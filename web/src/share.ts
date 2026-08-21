/**
 * Turning a finished game into something worth pasting.
 *
 * The grid has to say how the game went without saying what the answer was,
 * which is the whole trick of the form: a row shows how close a guess landed
 * and which way it pointed, and someone who has not played yet learns nothing
 * from it except that you struggled.
 */

import type { Game, GuessResult } from './game';

/** How many squares make up a row. */
export const SQUARES = 5;

const FILLED = '🟩';
const EMPTY = '⬜';
const WON = '🎉';

/**
 * A guess as a bar of squares.
 *
 * Proximity is already 0 at the far side of the continent and 1 when correct,
 * so this is just that on a five-square scale. Rounding rather than flooring,
 * because a guess 400 km away deserves its fifth square more than the four it
 * would otherwise get, and no wrong guess can round up to five: that needs
 * proximity above 0.9, which is 550 km, and the squares are a feel rather
 * than a measurement.
 */
export const squaresFor = (guess: GuessResult): string => {
  if (guess.correct) return FILLED.repeat(SQUARES);
  const filled = Math.min(SQUARES - 1, Math.round(guess.proximity * SQUARES));
  return FILLED.repeat(filled) + EMPTY.repeat(SQUARES - filled);
};

export interface ShareOptions {
  puzzle: number;
  url: string;
}

/**
 * The text a player copies.
 *
 * Deliberately without the shelf's name, and without the distances: a
 * kilometre figure would narrow the answer down for anyone who knows the
 * continent, which is exactly the audience this is for.
 */
export const shareText = (game: Game, options: ShareOptions): string => {
  const score = game.status === 'won' ? `${game.guesses.length}` : 'X';
  const lines = [`wordie #${options.puzzle} ${score}/${game.maxGuesses}`, ''];
  for (const guess of game.guesses) {
    lines.push(`${squaresFor(guess)} ${guess.correct ? WON : guess.arrow}`);
  }
  lines.push('', options.url);
  return lines.join('\n');
};

/**
 * Put the text on the clipboard, however this browser allows it.
 *
 * The async clipboard API needs a secure context and a permission that can be
 * refused, so the old selection trick stays as a fallback. Returns whether
 * anything actually made it.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused or unavailable; fall through and try the other way.
  }

  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    // Kept out of view and out of the tab order, but it has to be in the
    // document for a selection to exist at all.
    holder.setAttribute('readonly', '');
    holder.style.position = 'fixed';
    holder.style.opacity = '0';
    document.body.append(holder);
    holder.select();
    const copied = document.execCommand('copy');
    holder.remove();
    return copied;
  } catch {
    return false;
  }
};
