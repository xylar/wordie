// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderSky } from './ui';

describe('the Halloween sky', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
  });

  it('is nowhere in the page until it is asked for', () => {
    // The whole point of building it in script: on the other 364 days there
    // is no moon in the markup for anyone to find early.
    expect(document.querySelector('#sky')).toBeNull();
  });

  it('hangs a moon and cloud behind the page', () => {
    renderSky(document.body);
    expect(document.querySelectorAll('#sky .moon')).toHaveLength(1);
    expect(document.querySelectorAll('#sky .cloud').length).toBeGreaterThan(0);
    // The styles hang off the class rather than off the element, so both have
    // to arrive together.
    expect(document.body.classList.contains('halloween')).toBe(true);
  });

  it('comes before the game and stays out of its way', () => {
    const app = document.createElement('main');
    document.body.append(app);
    renderSky(document.body);

    expect(document.body.firstElementChild?.id).toBe('sky');
    expect(document.querySelector('#sky')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('is built once, however many times it is asked for', () => {
    renderSky(document.body);
    renderSky(document.body);
    expect(document.querySelectorAll('#sky')).toHaveLength(1);
  });
});
