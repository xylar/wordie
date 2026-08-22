/**
 * Putting the wordmark in the page.
 *
 * Inlined rather than loaded through an `<img>`, and the reason is not
 * aesthetic. An image is a separate document: it does not inherit this page's
 * `color-scheme`, so a browser applying its own dark treatment decides about
 * the image on its own terms. Chrome for Android's "darken websites" setting
 * leaves this page alone -- it declares `color-scheme: dark` -- and then
 * lightness-inverts the mark, which turns its dark ground into pale blue and
 * its ice into navy, on a page that stayed dark around it.
 *
 * Inlined, it is ordinary DOM. It inherits `currentColor`, it is covered by
 * the page's own declaration, and there is no second document for anything to
 * form a separate opinion about.
 */

// Bundled at build time from the file the pipeline writes, so the page and
// the README cannot drift apart. `?raw` gives the text rather than a URL.
import wordmarkSvg from './assets/logo-wordmark.svg?raw';

export const drawWordmark = (
  heading: HTMLElement | null = document.querySelector('h1.wordmark'),
): void => {
  if (!heading) return;

  const parsed = new DOMParser().parseFromString(wordmarkSvg, 'image/svg+xml');
  const svg = parsed.querySelector('svg');
  // If anything went wrong, the heading keeps the plain text it started with,
  // which is a worse logo and a perfectly good heading.
  if (!svg || parsed.querySelector('parsererror')) return;

  // The heading carries the name in a visually hidden span, so the mark is
  // decoration and is hidden from assistive technology entirely -- title and
  // description included, since a hidden element has no use for them.
  //
  // The word is still in the DOM twice: the mark draws "wordie" as an SVG
  // <text>, which is what makes it a wordmark. Only the span is announced,
  // because the rest is hidden.
  svg.setAttribute('aria-hidden', 'true');
  svg.removeAttribute('role');
  svg.removeAttribute('aria-labelledby');
  for (const child of [...svg.children]) {
    if (child.localName === 'title' || child.localName === 'desc') {
      child.remove();
    }
  }
  // Let the stylesheet size it.
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  // Read from the label already there if this has run before, so calling it
  // twice is the same as calling it once.
  const previous = heading.querySelector('.visually-hidden');
  const name = (previous ?? heading).textContent?.trim();

  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent = name === undefined || name === '' ? 'wordie' : name;

  heading.replaceChildren(label, svg);
};
