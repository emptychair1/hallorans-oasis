import { defineConfig } from 'vite';
import { readdir, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export default defineConfig({
  plugins: [{
    name: 'automatic-oasis-version',
    transformIndexHtml(html) {
      if (!html.includes('__OASIS_VERSION_LABEL__')) return html;
      const baseline = '83e5aac6bba7860bae2a977134be3b5450f2139e';
      // A full Git history is required so shallow clones cannot silently reset the counter.
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', baseline, 'HEAD'], { stdio: 'pipe' });
        const commits = Number(execFileSync('git', ['rev-list', '--count', `${baseline}..HEAD`], { encoding: 'utf8' }).trim());
        if (!Number.isSafeInteger(commits) || commits < 0) throw new Error('Invalid commit count');
        return html.replaceAll('__OASIS_VERSION_LABEL__', `V9.${12 + commits} · EXPRESSION HOLD`);
      } catch (error) {
        throw new Error('Cannot calculate Oasis version. Build requires Git history including baseline 83e5aac (disable shallow clone).', { cause: error });
      }
    }
  }, {
    name: 'ensure-mediapipe-assets',
    async buildStart() {
      const from = 'node_modules/@mediapipe/tasks-vision/wasm';
      const to = 'public/mediapipe/wasm';
      await mkdir(to, { recursive: true });
      const names = await readdir(from);
      for (const name of names.filter((n: string) => n.endsWith('.js') || n.endsWith('.wasm'))) await copyFile(join(from,name),join(to,name));
      for (const required of ['vision_wasm_internal.js','vision_wasm_internal.wasm']) {
        const bytes = await readFile(join(to,required));
        if (bytes.length < 10000) throw new Error('MediaPipe build asset invalid: ' + required + ' (' + bytes.length + ' bytes)');
      }
      const model = 'public/mediapipe/face_landmarker.task';
      let valid = false;
      try { valid = (await readFile(model)).length > 1000000; } catch { /* download below */ }
      if (!valid) {
        const response = await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');
        if (!response.ok) throw new Error('MediaPipe model download HTTP ' + response.status);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 1000000) throw new Error('MediaPipe model too small');
        await writeFile(model, bytes);
      }
    }
  }],
  server: { host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: new URL('./index.html', import.meta.url).pathname, mouthLab: new URL('./mouth-lab.html', import.meta.url).pathname, visemeLab: new URL('./viseme-lab.html', import.meta.url).pathname, oasisLive: new URL('./oasis-live.html', import.meta.url).pathname, lighterSyncLab: new URL('./lighter-sync-lab.html', import.meta.url).pathname, expressionLab: new URL('./expression-lab.html', import.meta.url).pathname, faceMapLab: new URL('./face-map-lab.html', import.meta.url).pathname, faceTransferLab: new URL('./face-transfer-lab.html', import.meta.url).pathname } }
  }
});
