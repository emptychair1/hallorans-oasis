import originalUrl from '../IMG_4604.jpeg?url';
import expressionUrl from '../assets/expressions/b017e04480c791dd998208cd70049c066ffc3d67a00aa412d94ed959833ee1b2.png?url';

type Point = { x: number; y: number; z?: number };
type FaceResult = { faceLandmarks: Point[][] };
type Detector = { detect(image: HTMLImageElement): FaceResult };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const run = $<HTMLButtonElement>('run');
const mesh = $<HTMLInputElement>('mesh');
const originals = [$<HTMLImageElement>('original'), $<HTMLImageElement>('expression')];
const canvases = [$<HTMLCanvasElement>('original-overlay'), $<HTMLCanvasElement>('expression-overlay')];
const labels = [$<HTMLParagraphElement>('original-status'), $<HTMLParagraphElement>('expression-status')];
const results: (Point[] | null)[] = [null, null];
originals[0].src = originalUrl;
originals[1].src = expressionUrl;
const ready = (img: HTMLImageElement) => img.decode();
function draw(i: number) {
  const img = originals[i], canvas = canvases[i], points = results[i];
  if (!img.naturalWidth) return;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  if (mesh.checked) {
    ctx.fillStyle = 'rgba(85,240,218,.8)';
    const radius = Math.max(1.3, canvas.width / 650);
    for (const p of points) {
      ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  const anchors: [number, string][] = [[33,'L eye'],[263,'R eye'],[1,'Nose'],[61,'L lip'],[291,'R lip'],[152,'Chin'],[70,'L brow'],[300,'R brow']];
  ctx.font = `${Math.max(12,canvas.width/48)}px system-ui`;
  ctx.lineWidth = Math.max(2,canvas.width/500);
  for (const [index,name] of anchors) {
    const p = points[index]; if (!p) continue;
    const x=p.x*canvas.width,y=p.y*canvas.height;
    ctx.beginPath();ctx.arc(x,y,Math.max(4,canvas.width/130),0,Math.PI*2);
    ctx.strokeStyle='#ffce73';ctx.stroke();
    ctx.fillStyle='#ffce73';ctx.fillText(name,x+9,y-8);
  }
}
mesh.addEventListener('change', () => {draw(0);draw(1);});
run.addEventListener('click', async () => {
  run.disabled = true;
  let stage = 'startup';
  try {
    status.textContent = 'Loading MediaPipe face landmark detector…';
    await Promise.all(originals.map(ready));
    // Vite bundles the JavaScript module locally; only WASM/model assets load externally.
    stage = 'JavaScript import'; status.textContent = 'Stage 1: loading MediaPipe JavaScript';
    const vision = await import('@mediapipe/tasks-vision');
    stage = 'WASM runtime'; status.textContent = 'Stage 2: loading MediaPipe WASM';
    const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    stage = 'model initialization'; status.textContent = 'Stage 3: loading face model';
    const detector: Detector = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 1
    });
    stage = 'face detection'; status.textContent = 'Stage 4: detecting faces';
    originals.forEach((img,i) => {
      const faces = detector.detect(img).faceLandmarks;
      results[i] = faces[0] ?? null;
      labels[i].textContent = faces.length ? `Detected ${faces[0].length} landmarks · image ${img.naturalWidth} × ${img.naturalHeight}` : 'No face detected. Try another reference image.';
      draw(i);
    });
    status.textContent = results.every(Boolean) ? 'Both faces mapped. Inspect eyes, brows, nose, lips, and chin before Bite 02.' : 'Detection incomplete. Do not proceed to transplant until both faces map.';
  } catch (e) {
    status.textContent = 'Detection failed at ' + stage + ': ' + (e instanceof Error ? e.message : (e instanceof Event ? 'Resource event ' + e.type : String(e)));
  } finally { run.disabled = false; }
});
Promise.all(originals.map(ready)).then(()=>{status.textContent='Images loaded. Tap Detect faces.';}).catch(e=>{status.textContent='Image load failed: '+String(e);});
