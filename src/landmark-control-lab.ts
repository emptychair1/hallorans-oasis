import {FaceLandmarker} from '@mediapipe/tasks-vision';
import {approvedExpressions,type Point} from './calibrated-expression-renderer';
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const select=document.querySelector<HTMLSelectElement>('#expression')!;
const status=document.querySelector<HTMLElement>('#status')!;
const names=['brows','eyes','cheeks','mouth'] as const;
type Region=typeof names[number];
const controls=Object.fromEntries(names.map(n=>[n,document.querySelector<HTMLInputElement>('#'+n)!])) as Record<Region,HTMLInputElement>;
const original=new Image();original.src=new URL('../IMG_4604.jpeg',import.meta.url).href;
const indices=(edges:readonly {start:number;end:number}[])=>new Set(edges.flatMap(e=>[e.start,e.end]));
const mouth=indices(FaceLandmarker.FACE_LANDMARKS_LIPS);
const leftEye=indices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE),rightEye=indices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
const leftBrow=indices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),rightBrow=indices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
const eye=new Set([...leftEye,...rightEye]),brow=new Set([...leftBrow,...rightBrow]);
for(const e of approvedExpressions){const option=document.createElement('option');option.value=e.filename;option.textContent=e.name;select.append(option);}
select.value=approvedExpressions.find(e=>e.filename==='smile.json')?.filename||approvedExpressions[0]?.filename||'';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
let raf=0,epoch=0;
function draw(){
 if(!original.complete||!original.naturalWidth)return;
 canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;
 ctx.drawImage(original,0,0);
 const expression=approvedExpressions.find(e=>e.filename===select.value);
 if(!expression){status.textContent='No approved maps available.';return;}
 const src=expression.map.images.find(i=>i.role==='locked-original')?.landmarks;
 const ref=expression.map.images.find(i=>i.role==='expression-reference')?.landmarks;
 if(!src||!ref)return;
 const box=(pts:Point[])=>({x:Math.min(...pts.map(p=>p.x)),y:Math.min(...pts.map(p=>p.y)),w:Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),h:Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))});
 const a=box(src),b=box(ref),sx=a.w/Math.max(.001,b.w),sy=a.h/Math.max(.001,b.h);
 const factors=Object.fromEntries(names.map(n=>[n,Number(controls[n].value)/100])) as Record<Region,number>;
 const w=canvas.width,h=canvas.height;
 // Assign landmark controls by anatomical groups; cheek control covers non-eye/non-mouth face points.
 const region=(i:number):Region=>mouth.has(i)?'mouth':eye.has(i)?'eyes':brow.has(i)?'brows':'cheeks';
 ctx.save();ctx.lineWidth=Math.max(1,w/750);
 for(let i=0;i<src.length;i++){
  const p=src[i],q=ref[i],r=region(i),t=factors[r];
  const tx=a.x+(q.x-b.x)*sx,ty=a.y+(q.y-b.y)*sy;
  const dx=(p.x+(tx-p.x)*t)*w,dy=(p.y+(ty-p.y)*t)*h;
  const ox=p.x*w,oy=p.y*h;
  if(t>.01){ctx.strokeStyle='rgba(65,215,195,.65)';ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(dx,dy);ctx.stroke();}
  ctx.fillStyle='rgba(239,177,83,.6)';ctx.beginPath();ctx.arc(ox,oy,1.65,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#43dec9';ctx.beginPath();ctx.arc(dx,dy,2.15,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
 status.textContent=expression.name+' · 478 mapped points · '+names.map(n=>n+' '+Math.round(factors[n]*100)+'%').join(' · ');
}
for(const n of names)controls[n].oninput=()=>{epoch++;cancelAnimationFrame(raf);document.querySelector<HTMLOutputElement>('#'+n+'Value')!.textContent=controls[n].value+'%';draw();};
select.onchange=()=>{epoch++;cancelAnimationFrame(raf);draw();};
document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{epoch++;cancelAnimationFrame(raf);for(const n of names){controls[n].value='0';document.querySelector<HTMLOutputElement>('#'+n+'Value')!.textContent='0%';}draw();};
document.querySelector<HTMLButtonElement>('#demo')!.onclick=()=>{
 epoch++;cancelAnimationFrame(raf);const run=epoch,start=performance.now();
 const delays:Record<Region,number>={brows:0,eyes:180,cheeks:350,mouth:550};
 const tick=(now:number)=>{if(run!==epoch)return;let active=false;for(const n of names){const t=clamp((now-start-delays[n])/950),hold=clamp((now-start-delays[n]-1200)/1000);const eased=t*t*(3-2*t),out=hold*hold*(3-2*hold);const v=Math.round(100*eased*(1-out));controls[n].value=String(v);document.querySelector<HTMLOutputElement>('#'+n+'Value')!.textContent=v+'%';if(now-start<delays[n]+2200)active=true;}draw();if(active)raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
};
original.onload=draw;original.onerror=()=>status.textContent='Base portrait failed to load.';draw();
