import { defineConfig } from 'vite';

// base './' so the build works from any GitHub Pages sub-path (/dopadoom/).
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
