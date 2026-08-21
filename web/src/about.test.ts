// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderAbout } from './about';
import type { Source } from './shelves';

const SOURCES: Source[] = [
  {
    role: 'ice shelf geometry',
    title: 'MEaSUREs BedMachine Antarctica, Version 4',
    citation: 'Morlighem, M. (2025). MEaSUREs BedMachine Antarctica.',
    doi: 'https://doi.org/10.5067/POJQI54A45HX',
    reference: 'Morlighem, M., et al. (2020). Nature Geoscience, 13, 132-137.',
  },
  {
    role: 'ice shelf names',
    title: 'MEaSUREs Antarctic Boundaries, Version 2',
    citation: 'Mouginot, J., Scheuchl, B. & Rignot, E. (2017).',
    doi: 'https://doi.org/10.5067/AXE4121732AD',
    reference: 'Rignot, E., et al. (2013). Science, 341, 266-270.',
  },
];

const NOTE = 'Derived product. Cite the sources below, not this file.';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
});

describe('renderAbout', () => {
  it('credits every source it was given', () => {
    // Citation is the condition both datasets attach to their use, and the
    // game is the most public thing this repository produces -- most people
    // who meet it will never see the README.
    renderAbout(container, SOURCES, NOTE);

    expect(container.querySelectorAll('.sources li')).toHaveLength(2);
    for (const source of SOURCES) {
      expect(container.textContent).toContain(source.citation);
      expect(container.textContent).toContain(source.reference);
      expect(container.textContent).toContain(source.role);
    }
  });

  it('links each DOI', () => {
    renderAbout(container, SOURCES, NOTE);
    const links = [...container.querySelectorAll('a')].map((a) => a.href);

    expect(links).toContain('https://doi.org/10.5067/POJQI54A45HX');
    expect(links).toContain('https://doi.org/10.5067/AXE4121732AD');
  });

  it('shows the DOI without its resolver prefix', () => {
    renderAbout(container, SOURCES, NOTE);
    const first = container.querySelector('.source-doi a');
    expect(first?.textContent).toBe('10.5067/POJQI54A45HX');
  });

  it('says the outlines are not the source data', () => {
    renderAbout(container, SOURCES, NOTE);
    expect(container.querySelector('.derived-note')?.textContent).toBe(NOTE);
  });

  it('renders the citations as text, not as markup', () => {
    // They come from a file fetched at runtime. Nothing here should be able
    // to put an element into the page.
    const hostile: Source[] = [
      { ...SOURCES[0]!, citation: '<img src=x onerror="alert(1)">' },
    ];
    renderAbout(container, hostile, NOTE);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });

  it('puts the note before the sources it refers to', () => {
    // The note ends "cite the sources below", which is where they sit in the
    // file it came from; the page has to agree with it.
    renderAbout(container, SOURCES, NOTE);
    const children = [...container.children];
    const note = container.querySelector('.derived-note');
    const list = container.querySelector('.sources');

    expect(children.indexOf(note!)).toBeLessThan(children.indexOf(list!));
  });

  it('replaces what was there before rather than appending', () => {
    renderAbout(container, SOURCES, NOTE);
    renderAbout(container, SOURCES, NOTE);
    expect(container.querySelectorAll('.sources')).toHaveLength(1);
  });

  it('copes with a file that lists no sources', () => {
    renderAbout(container, [], NOTE);
    expect(container.querySelectorAll('.sources li')).toHaveLength(0);
    expect(container.textContent).toContain(NOTE);
  });
});
