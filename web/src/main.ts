import './style.css';
import { loadShelves, outlinePath, type ShelfFeature } from './shelves';

/**
 * Draws one ice shelf. The game around it -- the guess list, the distance and
 * the bearing -- comes next; what this settles is that the outlines the
 * pipeline derives arrive intact in a browser and are recognisable.
 */
const drawShelf = (shelf: ShelfFeature): void => {
  const svg = document.querySelector<SVGSVGElement>('.shelf svg');
  const caption = document.querySelector<HTMLElement>('.shelf figcaption');
  if (!svg) return;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', outlinePath(shelf));
  // Even-odd winding is what renders the interior rings as ice rises rather
  // than filling them in.
  path.setAttribute('fill-rule', 'evenodd');
  svg.replaceChildren(path);

  if (caption) {
    caption.textContent = shelf.properties.name;
  }
};

const status = document.querySelector<HTMLParagraphElement>('#status');

loadShelves()
  .then((shelves) => {
    if (shelves.length === 0) {
      throw new Error('no ice shelves in the outline file');
    }
    // Largest first in the file, so this is Ross until there is a game to
    // choose for us.
    const shelf = shelves[0] as ShelfFeature;
    drawShelf(shelf);
    if (status) {
      status.textContent = `${shelves.length} ice shelves loaded.`;
    }
  })
  .catch((error: unknown) => {
    if (status) {
      status.textContent =
        error instanceof Error ? error.message : 'something went wrong';
    }
  });
