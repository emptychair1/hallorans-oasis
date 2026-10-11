import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), mouthLab: resolve(import.meta.dirname, 'mouth-lab.html') } }
  }
});
