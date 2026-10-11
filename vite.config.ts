import { defineConfig } from 'vite';
import { readdir, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export default defineConfig({
  plugins: [{
    name: 'automatic-oasis-version',
    async transformIndexHtml(html) {
      if (!html.includes('__OASIS_VERSION_LABEL__')) return html;
      const baseline = '83e5aac6bba7860bae2a977134be3b5450f2139e';
      // Cloudflare may provide a shallow clone. Ask GitHub for the commit distance,
      // rather than requiring the baseline object to exist in the local build checkout.
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const response = await fetch(`https://api.github.com/repos/emptychair1/hallorans-oasis/compare/${baseline}...${head}`, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'hallorans-oasis-version-build' }
      });
      if (!response.ok) throw new Error('Cannot calculate Oasis version: GitHub compare API returned HTTP ' + response.status);
      const comparison = await response.json() as { ahead_by?: number; status?: string };
      const commits = comparison.ahead_by;
      if (!Number.isSafeInteger(commits) || (commits as number) < 0 || comparison.status === 'behind' || comparison.status === 'diverged') {
        throw new Error('Cannot calculate Oasis version: baseline and build commit are not in the expected history.');
      }
      return html.replaceAll('__OASIS_VERSION_LABEL__', `V9.${12 + (commits as number)} · EXPRESSION HOLD`);
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
    rollupOptions: { input: { main: new URL('./index.html', import.meta.url).pathname, mouthLab: new URL('./mouth-lab.html', import.meta.url).pathname, visemeLab: new URL('./viseme-lab.html', import.meta.url).pathname, oasisLive: new URL('./oasis-live.html', import.meta.url).pathname, blinkingLab: new URL('./blinking-lab.html', import.meta.url).pathname, lighterSyncLab: new URL('./lighter-sync-lab.html', import.meta.url).pathname, expressionLab: new URL('./expression-lab.html', import.meta.url).pathname, faceMapLab: new URL('./face-map-lab.html', import.meta.url).pathname, faceTransferLab: new URL('./face-transfer-lab.html', import.meta.url).pathname } }
  }
});
