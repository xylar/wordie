import { beforeEach, describe, expect, it } from 'vitest';
import { forgetOldGames, loadGame, saveGame } from './storage';

/** A Storage that behaves, so the tests do not need a browser. */
class FakeStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
  }
}

/** A Storage that does not, which is what a private window gives you. */
const hostile: Storage = {
  get length(): number {
    throw new Error('denied');
  },
  key(): string | null {
    throw new Error('denied');
  },
  getItem(): string | null {
    throw new Error('denied');
  },
  setItem(): void {
    throw new Error('denied');
  },
  removeItem(): void {
    throw new Error('denied');
  },
  clear(): void {
    throw new Error('denied');
  },
};

let store: FakeStorage;

beforeEach(() => {
  store = new FakeStorage();
});

describe('saving and loading', () => {
  it('brings a game back', () => {
    saveGame(12, 'hard', { answer: 'Ross', guesses: ['Amery', 'Getz'] }, store);
    expect(loadGame(12, 'hard', 'Ross', store)).toEqual({
      answer: 'Ross',
      guesses: ['Amery', 'Getz'],
    });
  });

  it('keeps each day separate', () => {
    saveGame(12, 'hard', { answer: 'Ross', guesses: ['Amery'] }, store);
    expect(loadGame(13, 'hard', 'Ross', store)).toBeNull();
  });

  it('refuses a save for a different answer', () => {
    // The pool decides which shelf a day gets. If it changes, yesterday's
    // save would otherwise be restored against the wrong shelf.
    saveGame(12, 'hard', { answer: 'Ross', guesses: ['Amery'] }, store);
    expect(loadGame(12, 'hard', 'LarsenC', store)).toBeNull();
  });

  it('has nothing to offer for a day never played', () => {
    expect(loadGame(99, 'hard', 'Ross', store)).toBeNull();
  });

  it('keeps each level separate', () => {
    // A player who switches to easy halfway through the daily and back again
    // has to find their six-guess game still there. One save per day would
    // have thrown it away.
    saveGame(12, 'hard', { answer: 'Ross', guesses: ['Amery'] }, store);
    saveGame(12, 'easy', { answer: 'Ross', guesses: ['Getz'] }, store);
    expect(loadGame(12, 'hard', 'Ross', store)?.guesses).toEqual(['Amery']);
    expect(loadGame(12, 'easy', 'Ross', store)?.guesses).toEqual(['Getz']);
  });

  it('reads a save written before levels existed', () => {
    store.setItem(
      'wordie:v1:puzzle:12',
      JSON.stringify({ answer: 'Ross', guesses: ['Amery'] }),
    );
    expect(loadGame(12, 'hard', 'Ross', store)?.guesses).toEqual(['Amery']);
  });
});

describe('when the stored value cannot be trusted', () => {
  it('starts fresh rather than throwing on nonsense', () => {
    store.setItem('wordie:v1:puzzle:12', 'not json');
    expect(loadGame(12, 'hard', 'Ross', store)).toBeNull();
  });

  it('rejects a save missing its guesses', () => {
    store.setItem('wordie:v1:puzzle:12', JSON.stringify({ answer: 'Ross' }));
    expect(loadGame(12, 'hard', 'Ross', store)).toBeNull();
  });

  it('rejects guesses that are not names', () => {
    store.setItem(
      'wordie:v1:puzzle:12',
      JSON.stringify({ answer: 'Ross', guesses: [1, 2] }),
    );
    expect(loadGame(12, 'hard', 'Ross', store)).toBeNull();
  });
});

describe('when there is no storage to be had', () => {
  it('loads nothing rather than failing', () => {
    // A private window, or a browser told to block site data. Losing the
    // ability to save is a shame; failing to start is not acceptable.
    expect(loadGame(12, 'hard', 'Ross', null)).toBeNull();
    expect(loadGame(12, 'hard', 'Ross', hostile)).toBeNull();
  });

  it('saves nothing rather than failing', () => {
    expect(() =>
      saveGame(12, 'hard', { answer: 'Ross', guesses: [] }, null),
    ).not.toThrow();
    expect(() =>
      saveGame(12, 'hard', { answer: 'Ross', guesses: [] }, hostile),
    ).not.toThrow();
  });

  it('tidies nothing rather than failing', () => {
    expect(() => forgetOldGames(12, null)).not.toThrow();
    expect(() => forgetOldGames(12, hostile)).not.toThrow();
  });
});

describe('the key a level saves under', () => {
  it('gives hard the bare key it has always had', () => {
    // Not arbitrary: the bare key has always meant the six-guess game
    // against the open list, first when that was the only game there was and
    // then under the name `normal`. Hard is that game, so a save written
    // this morning is still there this afternoon under its new name -- and,
    // just as important, is not restored into a two-guess round it would
    // lose on the spot.
    saveGame(12, 'hard', { answer: 'Ross', guesses: [] }, store);

    expect(store.getItem('wordie:v1:puzzle:12')).not.toBeNull();
  });

  it('keeps a game per level on the same day', () => {
    // A player who switches down a rung halfway through the daily and back
    // again finds both games where they left them.
    saveGame(12, 'hard', { answer: 'Ross', guesses: ['Amery'] }, store);
    saveGame(12, 'easy', { answer: 'Ross', guesses: ['Getz'] }, store);

    expect(loadGame(12, 'hard', 'Ross', store)?.guesses).toEqual(['Amery']);
    expect(loadGame(12, 'easy', 'Ross', store)?.guesses).toEqual(['Getz']);
  });

  it('does not hand a medium save to easy', () => {
    // They allow the same two guesses at the same six names, and differ only
    // in the map. Sharing a key would be tidier and would lose one of them.
    saveGame(12, 'medium', { answer: 'Ross', guesses: ['Amery'] }, store);

    expect(loadGame(12, 'easy', 'Ross', store)).toBeNull();
  });
});

describe('forgetOldGames', () => {
  it('drops saves more than a week old', () => {
    saveGame(1, 'hard', { answer: 'A', guesses: [] }, store);
    saveGame(20, 'hard', { answer: 'B', guesses: [] }, store);
    saveGame(30, 'hard', { answer: 'C', guesses: [] }, store);

    forgetOldGames(30, store);

    expect(loadGame(1, 'hard', 'A', store)).toBeNull();
    expect(loadGame(20, 'hard', 'B', store)).toBeNull();
    expect(loadGame(30, 'hard', 'C', store)).not.toBeNull();
  });

  it('removes several at once without losing count', () => {
    // Removing while iterating shifts the indices underneath, so the keys are
    // collected before any of them are deleted.
    for (let day = 1; day <= 10; day += 1) {
      saveGame(day, 'hard', { answer: 'A', guesses: [] }, store);
    }
    forgetOldGames(50, store);
    expect(store.length).toBe(0);
  });

  it('leaves anything that is not ours alone', () => {
    store.setItem('someone-elses-key', 'keep me');
    forgetOldGames(1000, store);
    expect(store.getItem('someone-elses-key')).toBe('keep me');
  });

  it('drops an old save at any level', () => {
    // The day is the leading digits of the key; a levelled key carries a
    // suffix after it. Reading the whole tail as a number would leave every
    // easy save in storage for ever.
    saveGame(1, 'easy', { answer: 'A', guesses: [] }, store);
    forgetOldGames(30, store);
    expect(loadGame(1, 'easy', 'A', store)).toBeNull();
  });

  it('ignores a key it cannot read a day out of', () => {
    store.setItem('wordie:v1:puzzle:tuesday', '{}');
    forgetOldGames(1000, store);
    expect(store.getItem('wordie:v1:puzzle:tuesday')).toBe('{}');
  });
});
