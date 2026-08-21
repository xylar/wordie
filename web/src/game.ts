/**
 * The rules: six guesses, and every wrong one tells you where you are.
 *
 * All of this is pure. The state machine takes a game and a guess and returns
 * a new game, with no reference to the page it will be drawn on, so the rules
 * can be tested without a browser and the drawing can change without touching
 * them.
 */

import {
  bearingArrow,
  geodesicDistance,
  mapBearing,
  type LonLat,
} from './scoring';
import type { ShelfFeature } from './shelves';

export const MAX_GUESSES = 6;

/**
 * The distance at which proximity reaches zero, in kilometres.
 *
 * The furthest apart any two shelf centroids get is 5,444 km, between Larsen A
 * on the Peninsula and the eastern Fox. Scaling against half the earth's
 * circumference, as a global version of this game would, would leave every
 * guess reading above 85% and tell the player nothing.
 */
export const PROXIMITY_SCALE_KM = 5_500;

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GuessResult {
  key: string;
  name: string;
  /** Geodesic distance between the two shelves' centroids, in km. */
  distanceKm: number;
  /** Bearing in the EPSG:3031 map plane, degrees clockwise from map-up. */
  bearingDeg: number;
  arrow: string;
  /** 0 at the far side of the continent, 1 when correct. */
  proximity: number;
  correct: boolean;
}

export interface Game {
  answer: ShelfFeature;
  guesses: GuessResult[];
  status: GameStatus;
  maxGuesses: number;
}

const positionOf = (shelf: ShelfFeature): LonLat => ({
  lon: shelf.properties.lon,
  lat: shelf.properties.lat,
});

export const createGame = (
  answer: ShelfFeature,
  maxGuesses: number = MAX_GUESSES,
): Game => ({ answer, guesses: [], status: 'playing', maxGuesses });

export const scoreGuess = (
  guess: ShelfFeature,
  answer: ShelfFeature,
): GuessResult => {
  const correct = guess.properties.key === answer.properties.key;
  const distanceKm =
    geodesicDistance(positionOf(guess), positionOf(answer)) / 1000;
  const bearingDeg = mapBearing(positionOf(guess), positionOf(answer));
  return {
    key: guess.properties.key,
    name: guess.properties.name,
    distanceKm,
    bearingDeg,
    arrow: correct ? '🎉' : bearingArrow(bearingDeg),
    proximity: Math.max(0, 1 - distanceKm / PROXIMITY_SCALE_KM),
    correct,
  };
};

/** Whether this shelf may still be guessed. */
export const canGuess = (game: Game, shelf: ShelfFeature): boolean =>
  game.status === 'playing' &&
  !game.guesses.some((guess) => guess.key === shelf.properties.key);

/**
 * Play a guess. Returns the game unchanged if it is over, or if this shelf
 * has already been guessed -- repeating a guess would spend one of six on
 * information the player already has.
 */
export const submitGuess = (game: Game, shelf: ShelfFeature): Game => {
  if (!canGuess(game, shelf)) return game;

  const result = scoreGuess(shelf, game.answer);
  const guesses = [...game.guesses, result];
  const status: GameStatus = result.correct
    ? 'won'
    : guesses.length >= game.maxGuesses
      ? 'lost'
      : 'playing';
  return { ...game, guesses, status };
};

export const guessesRemaining = (game: Game): number =>
  Math.max(0, game.maxGuesses - game.guesses.length);

/**
 * Candidate shelves for what the player has typed so far.
 *
 * Matches anywhere in the name rather than only at the start, so that "larsen"
 * finds every Larsen and "VI" finds George VI. Case and accents are ignored --
 * nobody should have to produce the o-umlaut in Ekström to guess it.
 */
export const matchingShelves = (
  shelves: ShelfFeature[],
  query: string,
  limit = 8,
): ShelfFeature[] => {
  const needle = normalise(query);
  if (needle.length === 0) return [];
  const matches = shelves.filter((shelf) =>
    normalise(shelf.properties.name).includes(needle),
  );
  // A name that starts with the query is the likelier intent than one that
  // merely contains it: typing "ross" should offer Ross before Crosson.
  matches.sort((a, b) => {
    const aStarts = normalise(a.properties.name).startsWith(needle);
    const bStarts = normalise(b.properties.name).startsWith(needle);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.properties.name.localeCompare(b.properties.name);
  });
  return matches.slice(0, limit);
};

export const normalise = (text: string): string =>
  text
    .normalize('NFD')
    // Strip combining marks, so Ekstrom matches Ekström. Written as escapes
    // rather than as literal combining characters, which are invisible in a
    // source file and easy to mangle.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
