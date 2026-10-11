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

// Warp the original photograph using MediaPipe's triangle topology.
// All regions share one destination mesh so the face remains continuous.
const adjacency=new Map<number,Set<number>>();
for(const edge of FaceLandmarker.FACE_LANDMARKS_TESSELATION){
 for(const [i,j] of [[edge.start,edge.end],[edge.end,edge.start]]){
  if(!adjacency.has(i))adjacency.set(i,new Set());
  adjacency.get(i)!.add(j);
 }
}
const triangles:number[][]=[],seen=new Set<string>();
for(const [a,neighbors] of adjacency)for(const b of neighbors)for(const c of neighbors){
 if(b===c||!adjacency.get(b)?.has(c))continue;
 const ids=[a,b,c].sort((x,y)=>x-y),key=ids.join('-');
 if(!seen.has(key)){seen.add(key);triangles.push(ids);}
}
function warp(source:Point[],target:Point[],w:number,h:number){
 for(const [i,j,k] of triangles){
  const a=source[i],b=source[j],c=source[k],d=target[i],e=target[j],f=target[k];
  const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
  if(Math.abs(det)<1e-6)continue;
  const ux=e.x-d.x,vx=f.x-d.x,uy=e.y-d.y,vy=f.y-d.y;
  const A=(ux*(c.y-a.y)-vx*(b.y-a.y))/det;
  const B=(uy*(c.y-a.y)-vy*(b.y-a.y))/det;
  const C=(vx*(b.x-a.x)-ux*(c.x-a.x))/det;
  const D=(vy*(b.x-a.x)-uy*(c.x-a.x))/det;
  ctx.save();ctx.beginPath();
  const mx=(d.x+e.x+f.x)/3,my=(d.y+e.y+f.y)/3;
  for(const [idx,p] of [d,e,f].entries()){
   const len=Math.hypot(p.x-mx,p.y-my)||1;
   const x=p.x+(p.x-mx)/len*.45,y=p.y+(p.y-my)/len*.45;
   if(idx===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.clip();
  ctx.setTransform(A,B,C,D,d.x-A*a.x-C*a.y,d.y-B*a.x-D*a.y);
  ctx.drawImage(original,0,0);ctx.restore();
 }
}

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
 const from=src.map(p=>({x:p.x*w,y:p.y*h}));
 const to=src.map((p,i)=>{
  const q=ref[i],t=factors[region(i)];
  const tx=a.x+(q.x-b.x)*sx,ty=a.y+(q.y-b.y)*sy;
  return {x:(p.x+(tx-p.x)*t)*w,y:(p.y+(ty-p.y)*t)*h};
 });
 // A modest neighborhood smoothing pass reduces seams between independently controlled regions.
 const smooth=to.map((p,i)=>{
  const neighbors=adjacency.get(i);
  if(!neighbors?.size)return p;
  const deltaX=p.x-from[i].x,deltaY=p.y-from[i].y;
  let nx=0,ny=0;
  for(const j of neighbors){nx+=to[j].x-from[j].x;ny+=to[j].y-from[j].y;}
  const mix=.2;
  return {x:from[i].x+deltaX*(1-mix)+nx/neighbors.size*mix,y:from[i].y+deltaY*(1-mix)+ny/neighbors.size*mix};
 });
 warp(from,smooth,w,h);
 // Sparse diagnostic landmarks remain visible for inspection.
 ctx.save();
 for(let i=0;i<src.length;i+=8){
  ctx.fillStyle='rgba(67,222,201,.8)';
  ctx.beginPath();ctx.arc(smooth[i].x,smooth[i].y,2,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
 status.textContent=expression.name+' · photographic mesh warp · 478 mapped points · '+names.map(n=>n+' '+Math.round(factors[n]*100)+'%').join(' · ');
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
