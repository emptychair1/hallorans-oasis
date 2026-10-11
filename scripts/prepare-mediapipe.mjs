import { mkdir, copyFile, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dest = 'public/mediapipe';
const wasmSource = 'node_modules/@mediapipe/tasks-vision/wasm';
const modelPath = join(dest, 'face_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
await mkdir(dest, { recursive: true });
for (const name of await readdir(wasmSource)) {
  if (name.endsWith('.wasm') || name.endsWith('.js')) {
    await copyFile(join(wasmSource, name), join(dest, name));
  }
}
let valid = false;
try {
  const bytes = await readFile(modelPath);
  valid = bytes.length > 1000000;
} catch {}
if (!valid) {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error('MediaPipe model download failed: HTTP ' + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 1000000) throw new Error('MediaPipe model unexpectedly small: ' + data.length);
  await writeFile(modelPath, data);
}
console.log('Local MediaPipe assets ready:', (await stat(modelPath)).size, 'model bytes');
