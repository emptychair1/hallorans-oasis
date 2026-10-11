import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: new URL('./index.html', import.meta.url).pathname, mouthLab: new URL('./mouth-lab.html', import.meta.url).pathname, visemeLab: new URL('./viseme-lab.html', import.meta.url).pathname, oasisLive: new URL('./oasis-live.html', import.meta.url).pathname, expressionLab: new URL('./expression-lab.html', import.meta.url).pathname } }
  }
});
