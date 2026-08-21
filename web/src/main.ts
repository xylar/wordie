import './style.css';

/**
 * Placeholder entry point. The game arrives in the pull requests that follow:
 * the outlines it draws come from a pipeline over BedMachine v4, and the rule
 * for scoring a guess already lives in `scoring.ts`, tested against PROJ.
 *
 * What this does today is prove the toolchain end to end -- that the module
 * graph builds, that the stylesheet is bundled, and that the deployed page on
 * GitHub Pages is really the one CI built.
 */
const status = document.querySelector<HTMLParagraphElement>('#status');
if (status) {
  status.textContent = 'Under construction.';
}
