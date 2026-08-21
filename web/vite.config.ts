// `vitest/config` rather than `vite` so that the `test` block below is typed;
// it re-exports Vite's own defineConfig with the test options merged in.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The game is served from https://xylar.github.io/wordie/, so assets have to
  // be requested relative to that subdirectory rather than the domain root.
  base: '/wordie/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
