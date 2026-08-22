// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { drawWordmark } from './wordmark';

let heading: HTMLElement;

beforeEach(() => {
  heading = document.createElement('h1');
  heading.className = 'wordmark';
  heading.textContent = 'wordie';
});

describe('drawWordmark', () => {
  it('puts the mark in the page as an element, not an image', () => {
    // The whole point. An <img> is a separate document that does not inherit
    // this page's colour-scheme, and a browser applying its own dark
    // treatment inverts it independently -- which is what turned the mark's
    // dark ground pale blue on Android.
    drawWordmark(heading);

    expect(heading.querySelector('svg')).not.toBeNull();
    expect(heading.querySelector('img')).toBeNull();
  });

  it('leaves the mark taking its colour from the page', () => {
    drawWordmark(heading);
    const filled = [...heading.querySelectorAll('[fill]')].map((node) =>
      node.getAttribute('fill'),
    );

    expect(filled.length).toBeGreaterThan(0);
    for (const fill of filled) expect(fill).toBe('currentColor');
  });

  it('keeps the name readable to a screen reader', () => {
    drawWordmark(heading);

    expect(heading.querySelector('.visually-hidden')?.textContent).toBe(
      'wordie',
    );
    // The heading already carries the name, so the mark is decoration.
    expect(heading.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(heading.querySelector('svg')?.hasAttribute('role')).toBe(false);
  });

  it('lets the stylesheet size it', () => {
    drawWordmark(heading);
    const svg = heading.querySelector('svg');

    expect(svg?.hasAttribute('width')).toBe(false);
    expect(svg?.hasAttribute('height')).toBe(false);
    expect(svg?.getAttribute('viewBox')).toBeTruthy();
  });

  it('does nothing at all without a heading to draw into', () => {
    expect(() => {
      drawWordmark(null);
    }).not.toThrow();
  });

  it('announces the name exactly once', () => {
    // The word is in the DOM twice -- the mark draws "wordie" as an SVG
    // <text>, which is what makes it a wordmark -- so what matters is that
    // only one copy reaches assistive technology.
    drawWordmark(heading);

    const announced = [...heading.querySelectorAll('*')].filter(
      (node) =>
        node.textContent?.includes('wordie') &&
        !node.closest('[aria-hidden="true"]'),
    );
    expect(announced).toHaveLength(1);
    expect(announced[0]?.className).toBe('visually-hidden');
  });

  it('strips the mark of its own title and description', () => {
    // A hidden element has no use for them.
    drawWordmark(heading);
    const svg = heading.querySelector('svg');
    const names = [...(svg?.children ?? [])].map((node) => node.localName);

    expect(names).not.toContain('title');
    expect(names).not.toContain('desc');
  });

  it('is the same called twice as called once', () => {
    drawWordmark(heading);
    drawWordmark(heading);

    expect(heading.querySelectorAll('svg')).toHaveLength(1);
    expect(heading.querySelectorAll('.visually-hidden')).toHaveLength(1);
    expect(heading.querySelector('.visually-hidden')?.textContent).toBe(
      'wordie',
    );
  });
});
