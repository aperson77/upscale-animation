import { defineConfig } from 'vite';

export default defineConfig({
  // Ensure Three.js examples are treated as external ESM
  optimizeDeps: {
    include: ['three'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
