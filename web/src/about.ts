/**
 * The about panel.
 *
 * Citation is the condition both datasets attach to their use, and the game
 * is the most public thing this repository produces -- most people who meet
 * it will never see the README. So the panel carries the citations, and it
 * takes them from the outline file itself rather than repeating them here.
 * One place to change them, and no way for the page to end up crediting
 * something other than the data it is drawing.
 */

import type { Source } from './shelves';

const link = (href: string, text: string): HTMLAnchorElement => {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = text;
  anchor.rel = 'noreferrer';
  return anchor;
};

const sourceEntry = (source: Source): HTMLLIElement => {
  const item = document.createElement('li');

  const role = document.createElement('span');
  role.className = 'source-role';
  role.textContent = source.role;

  const citation = document.createElement('p');
  citation.className = 'source-citation';
  citation.textContent = source.citation;

  const doi = document.createElement('p');
  doi.className = 'source-doi';
  doi.append(link(source.doi, source.doi.replace('https://doi.org/', '')));

  const reference = document.createElement('p');
  reference.className = 'source-citation';
  reference.textContent = source.reference;

  item.append(role, citation, doi, reference);
  return item;
};

export const renderAbout = (
  container: HTMLElement,
  sources: Source[],
  note: string,
): void => {
  const list = document.createElement('ul');
  list.className = 'sources';
  list.append(...sources.map(sourceEntry));

  const caveat = document.createElement('p');
  caveat.className = 'derived-note';
  caveat.textContent = note;

  // The note ends "cite the sources below", which is where they are in the
  // file it came from. Putting it first here keeps that true on the page too,
  // rather than rewording a string the pipeline owns.
  container.replaceChildren(caveat, list);
};
