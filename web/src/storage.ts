/**
 * Remembering the game in progress.
 *
 * A daily puzzle that forgets itself on reload is worse than no daily puzzle:
 * a stray refresh costs the player their guesses and there is no way back,
 * because tomorrow is a different shelf.
 *
 * What is stored is the list of shelves guessed, not the state they produced.
 * Distances and bearings are derived, and deriving them again on load means
 * a saved game cannot disagree with the rules -- if the scoring changes, an
 * old save comes back scored the new way rather than carrying yesterday's
 * numbers forward.
 */

const KEY_PREFIX = 'wordie:v1:puzzle:';

/** How many past days to keep before tidying up after ourselves. */
const KEEP_DAYS = 7;

export interface SavedGame {
  /** Which shelf the puzzle was, so a changed pool cannot resurrect a save. */
  answer: string;
  /** Shelf keys, in the order they were guessed. */
  guesses: string[];
}

/**
 * Storage is not always there to be had.
 *
 * A private window, a browser set to block site data, or an iframe with the
 * wrong sandbox flags will throw on the *first property access*, not on the
 * call -- so this reaches for it inside the guard rather than passing it
 * around. Losing the ability to save is a shame; failing to start is not
 * acceptable.
 */
const storage = (): Storage | null => {
  try {
    const probe = window.localStorage;
    const key = `${KEY_PREFIX}probe`;
    probe.setItem(key, '1');
    probe.removeItem(key);
    return probe;
  } catch {
    return null;
  }
};

const keyFor = (puzzle: number): string => `${KEY_PREFIX}${puzzle}`;

export const saveGame = (
  puzzle: number,
  game: SavedGame,
  store: Storage | null = storage(),
): void => {
  if (!store) return;
  try {
    store.setItem(keyFor(puzzle), JSON.stringify(game));
  } catch {
    // A full quota is not worth interrupting a game over.
  }
};

export const loadGame = (
  puzzle: number,
  answer: string,
  store: Storage | null = storage(),
): SavedGame | null => {
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(puzzle));
    if (raw === null) return null;
    const saved = JSON.parse(raw) as Partial<SavedGame>;
    if (
      typeof saved.answer !== 'string' ||
      !Array.isArray(saved.guesses) ||
      saved.guesses.some((guess) => typeof guess !== 'string')
    ) {
      return null;
    }
    // The pool decides which shelf a given day gets, so a change to it would
    // otherwise restore a game against the wrong answer.
    if (saved.answer !== answer) return null;
    return { answer: saved.answer, guesses: saved.guesses };
  } catch {
    // Malformed or unreadable: start fresh rather than argue about it.
    return null;
  }
};

/** Drop saves older than a week, so this does not grow without end. */
export const forgetOldGames = (
  puzzle: number,
  store: Storage | null = storage(),
): void => {
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null || !key.startsWith(KEY_PREFIX)) continue;
      const day = Number(key.slice(KEY_PREFIX.length));
      if (Number.isFinite(day) && day < puzzle - KEEP_DAYS) stale.push(key);
    }
    // Collected first: removing while iterating shifts the indices underneath.
    for (const key of stale) store.removeItem(key);
  } catch {
    // Tidying is optional.
  }
};
