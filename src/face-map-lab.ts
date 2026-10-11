import originalUrl from '../IMG_4604.jpeg?url';
const expressionFiles = import.meta.glob('../assets/expressions/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string,string>;
const expressionEntries = Object.entries(expressionFiles).sort(([a],[b])=>a.localeCompare(b));
const defaultExpression = 'b017e04480c791dd998208cd70049c066ffc3d67a00aa412d94ed959833ee1b2.png';

type Point = { x: number; y: number; z?: number };
type FaceResult = { faceLandmarks: Point[][] };
type Detector = { detect(image: HTMLImageElement): FaceResult };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const run = $<HTMLButtonElement>('run');
const mesh = $<HTMLInputElement>('mesh');
const exportButton = $<HTMLButtonElement>('export');
const copyButton = $<HTMLButtonElement>('copy');
const expressionSelect = $<HTMLSelectElement>('expression-select');
for (const [path] of expressionEntries) {
  const option = document.createElement('option');
  option.value = path; option.textContent = path.split('/').pop()!;
  expressionSelect.append(option);
}
expressionSelect.value = expressionEntries.find(([p])=>p.endsWith('/'+defaultExpression))?.[0] ?? expressionEntries[0]?.[0] ?? '';
const originals = [$<HTMLImageElement>('original'), $<HTMLImageElement>('expression')];
const canvases = [$<HTMLCanvasElement>('original-overlay'), $<HTMLCanvasElement>('expression-overlay')];
const labels = [$<HTMLParagraphElement>('original-status'), $<HTMLParagraphElement>('expression-status')];
const results: (Point[] | null)[] = [null, null];
originals[0].src = originalUrl;
originals[1].src = expressionFiles[expressionSelect.value] ?? '';
expressionSelect.addEventListener('change', () => {
  results[1] = null;
  exportButton.disabled = true; copyButton.disabled = true;
  labels[1].textContent = 'Reference changed. Tap Detect faces.';
  originals[1].src = expressionFiles[expressionSelect.value] ?? '';
  canvases[1].getContext('2d')?.clearRect(0,0,canvases[1].width,canvases[1].height);
  status.textContent = 'Selected '+expressionSelect.selectedOptions[0]?.textContent+'. Tap Detect faces.';
});
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
const imageNames = () => ['IMG_4604.jpeg', expressionSelect.selectedOptions[0]?.textContent ?? 'unknown'];
function faceMapJSON(expressionName?: string): string {
  if (!results[0] || !results[1]) throw new Error('Detect both faces before exporting.');
  return JSON.stringify({
    schema: 'piper-face-maps-v1',
    ...(expressionName ? { expressionName } : {}),
    detector: '@mediapipe/tasks-vision FaceLandmarker',
    coordinateSystem: 'normalized image coordinates, x/y in [0,1], z relative',
    images: originals.map((img, i) => ({
      role: i === 0 ? 'locked-original' : 'expression-reference',
      filename: imageNames()[i],
      width: img.naturalWidth,
      height: img.naturalHeight,
      landmarkCount: results[i]!.length,
      landmarks: results[i]!.map(p => ({x:p.x, y:p.y, z:p.z ?? 0}))
    }))
  }, null, 2);
}
exportButton.addEventListener('click', () => {
  try {
    const enteredName = window.prompt('Name this expression (for example: Shy, Laughing, Embarrassed):');
    if (enteredName === null) return;
    const expressionName = enteredName.trim();
    if (!expressionName) { status.textContent = 'Enter an expression name to export.'; return; }
    const safeName = expressionName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!safeName) { status.textContent = 'Use letters or numbers in the expression name.'; return; }
    const blob = new Blob([faceMapJSON(expressionName)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = safeName + '.json';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = 'JSON export requested. On iPhone, check Downloads or the Files app. If download is blocked, use Copy JSON.';
  } catch (e) { status.textContent = String(e); }
});
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(faceMapJSON());
    status.textContent = 'Both face maps copied as JSON. Paste into a file or send here.';
  } catch (e) { status.textContent = 'Clipboard failed: ' + String(e) + '. Try Export JSON.'; }
});
mesh.addEventListener('change', () => {draw(0);draw(1);});
run.addEventListener('click', async () => {
  run.disabled = true;
  exportButton.disabled = true;
  copyButton.disabled = true;
  results[0] = null; results[1] = null;
  let stage = 'startup';
  try {
    status.textContent = 'Loading MediaPipe face landmark detector…';
    await Promise.all(originals.map(ready));
    // JavaScript, WASM and model are served from the same origin after the build asset preparation step.
    stage = 'JavaScript import'; status.textContent = 'Stage 1: loading MediaPipe JavaScript';
    const vision = await import('@mediapipe/tasks-vision');
    stage = 'WASM runtime'; status.textContent = 'Stage 2: loading MediaPipe WASM';
    // iOS can report "ModuleFactory not set" if the runtime JS fails to execute.
    // Preflight exact same-origin files and report the failing URL rather than masking it.
    const root = new URL('/mediapipe/wasm', window.location.href);
    const files = await vision.FilesetResolver.forVisionTasks(root.href);
    for (const [kind, url] of [['WASM loader', files.wasmLoaderPath], ['WASM binary', files.wasmBinaryPath]] as const) {
      stage = kind; status.textContent = 'Checking ' + kind + '…';
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(kind + ' HTTP ' + response.status + ': ' + url);
      if (kind === 'WASM loader') { const body = await response.text(); if (body.trimStart().startsWith('<') || body.length < 1000) throw new Error('Invalid WASM loader response (' + body.length + ' chars): ' + url); }
      if (kind === 'WASM binary') { const bytes = await response.arrayBuffer(); if (bytes.byteLength < 10000 || new Uint8Array(bytes)[0] !== 0 || new Uint8Array(bytes)[1] !== 97) throw new Error('Invalid WASM binary (' + bytes.byteLength + ' bytes): ' + url); }
    }
    stage = 'model download'; status.textContent = 'Stage 3: checking face model';
    const modelResponse = await fetch('/mediapipe/face_landmarker.task', { cache: 'no-store' });
    if (!modelResponse.ok) throw new Error('Face model HTTP ' + modelResponse.status);
    const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
    if (modelBytes.byteLength < 1000000) throw new Error('Face model incomplete: ' + modelBytes.byteLength + ' bytes');
    stage = 'model initialization'; status.textContent = 'Stage 4: initializing face model';
    const detector: Detector = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: modelBytes, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 1
    });
    stage = 'face detection'; status.textContent = 'Stage 5: detecting faces';
    originals.forEach((img,i) => {
      const faces = detector.detect(img).faceLandmarks;
      results[i] = faces[0] ?? null;
      labels[i].textContent = faces.length ? `Detected ${faces[0].length} landmarks · image ${img.naturalWidth} × ${img.naturalHeight}` : 'No face detected. Try another reference image.';
      draw(i);
    });
    exportButton.disabled = !results.every(Boolean);
    copyButton.disabled = !results.every(Boolean);
    status.textContent = results.every(Boolean) ? 'Both faces mapped. Inspect eyes, brows, nose, lips, and chin before Bite 02.' : 'Detection incomplete. Do not proceed to transplant until both faces map.';
  } catch (e) {
    status.textContent = 'Detection failed at ' + stage + ': ' + (e instanceof Error ? e.message : (e instanceof Event ? 'Resource event ' + e.type : String(e)));
  } finally { run.disabled = false; }
});
Promise.all(originals.map(ready)).then(()=>{status.textContent='Images loaded. Tap Detect faces.';}).catch(e=>{status.textContent='Image load failed: '+String(e);});
