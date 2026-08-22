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
    saveGame(12, { answer: 'Ross', guesses: ['Amery', 'Getz'] }, store);
    expect(loadGame(12, 'Ross', store)).toEqual({
      answer: 'Ross',
      guesses: ['Amery', 'Getz'],
    });
  });

  it('keeps each day separate', () => {
    saveGame(12, { answer: 'Ross', guesses: ['Amery'] }, store);
    expect(loadGame(13, 'Ross', store)).toBeNull();
  });

  it('refuses a save for a different answer', () => {
    // The pool decides which shelf a day gets. If it changes, yesterday's
    // save would otherwise be restored against the wrong shelf.
    saveGame(12, { answer: 'Ross', guesses: ['Amery'] }, store);
    expect(loadGame(12, 'LarsenC', store)).toBeNull();
  });

  it('has nothing to offer for a day never played', () => {
    expect(loadGame(99, 'Ross', store)).toBeNull();
  });
});

describe('when the stored value cannot be trusted', () => {
  it('starts fresh rather than throwing on nonsense', () => {
    store.setItem('wordie:v1:puzzle:12', 'not json');
    expect(loadGame(12, 'Ross', store)).toBeNull();
  });

  it('rejects a save missing its guesses', () => {
    store.setItem('wordie:v1:puzzle:12', JSON.stringify({ answer: 'Ross' }));
    expect(loadGame(12, 'Ross', store)).toBeNull();
  });

  it('rejects guesses that are not names', () => {
    store.setItem(
      'wordie:v1:puzzle:12',
      JSON.stringify({ answer: 'Ross', guesses: [1, 2] }),
    );
    expect(loadGame(12, 'Ross', store)).toBeNull();
  });
});

describe('when there is no storage to be had', () => {
  it('loads nothing rather than failing', () => {
    // A private window, or a browser told to block site data. Losing the
    // ability to save is a shame; failing to start is not acceptable.
    expect(loadGame(12, 'Ross', null)).toBeNull();
    expect(loadGame(12, 'Ross', hostile)).toBeNull();
  });

  it('saves nothing rather than failing', () => {
    expect(() =>
      saveGame(12, { answer: 'Ross', guesses: [] }, null),
    ).not.toThrow();
    expect(() =>
      saveGame(12, { answer: 'Ross', guesses: [] }, hostile),
    ).not.toThrow();
  });

  it('tidies nothing rather than failing', () => {
    expect(() => forgetOldGames(12, null)).not.toThrow();
    expect(() => forgetOldGames(12, hostile)).not.toThrow();
  });
});

describe('forgetOldGames', () => {
  it('drops saves more than a week old', () => {
    saveGame(1, { answer: 'A', guesses: [] }, store);
    saveGame(20, { answer: 'B', guesses: [] }, store);
    saveGame(30, { answer: 'C', guesses: [] }, store);

    forgetOldGames(30, store);

    expect(loadGame(1, 'A', store)).toBeNull();
    expect(loadGame(20, 'B', store)).toBeNull();
    expect(loadGame(30, 'C', store)).not.toBeNull();
  });

  it('removes several at once without losing count', () => {
    // Removing while iterating shifts the indices underneath, so the keys are
    // collected before any of them are deleted.
    for (let day = 1; day <= 10; day += 1) {
      saveGame(day, { answer: 'A', guesses: [] }, store);
    }
    forgetOldGames(50, store);
    expect(store.length).toBe(0);
  });

  it('leaves anything that is not ours alone', () => {
    store.setItem('someone-elses-key', 'keep me');
    forgetOldGames(1000, store);
    expect(store.getItem('someone-elses-key')).toBe('keep me');
  });

  it('ignores a key it cannot read a day out of', () => {
    store.setItem('wordie:v1:puzzle:tuesday', '{}');
    forgetOldGames(1000, store);
    expect(store.getItem('wordie:v1:puzzle:tuesday')).toBe('{}');
  });
});
