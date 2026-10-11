import portraitUrl from '../IMG_4604.jpeg?url';
type Point = { x: number; y: number };
type Key = 'leftCorner'|'rightCorner'|'upperCenter'|'lowerCenter'|'cupidLeft'|'cupidRight'|'lowerLeft'|'lowerRight';
const keys: Key[] = ['leftCorner','cupidLeft','upperCenter','cupidRight','rightCorner','lowerRight','lowerCenter','lowerLeft'];
// Starting estimates only: calibrate by dragging markers on the actual photograph.
const defaults: Record<Key,Point> = {leftCorner:{x:.425,y:.705},cupidLeft:{x:.477,y:.691},upperCenter:{x:.5,y:.692},cupidRight:{x:.524,y:.691},rightCorner:{x:.576,y:.705},lowerRight:{x:.534,y:.724},lowerCenter:{x:.5,y:.731},lowerLeft:{x:.465,y:.724}};
const storeKey = 'piper-mouth-lab-01';
const img = document.querySelector<HTMLImageElement>('#portrait')!;
const svg = document.querySelector<SVGSVGElement>('#overlay')!;
const output = document.querySelector<HTMLElement>('#output')!;
img.src = portraitUrl;
let points: Record<Key,Point> = structuredClone(defaults);
try { const saved=JSON.parse(localStorage.getItem(storeKey)||'null'); if(saved && keys.every(k=>Number.isFinite(saved[k]?.x)&&Number.isFinite(saved[k]?.y))) points=saved; } catch { /* ignore corrupt local data */ }
let active: Key|null=null;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function draw(){
 const w=img.naturalWidth||1000,h=img.naturalHeight||1000;
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const coords=keys.map(k=>`${(points[k].x*w).toFixed(1)},${(points[k].y*h).toFixed(1)}`).join(' ');
 svg.replaceChildren();
 const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 line.setAttribute('points',coords);line.setAttribute('class','line');svg.append(line);
 keys.forEach(k=>{const p=points[k];const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',String(p.x*w));c.setAttribute('cy',String(p.y*h));c.setAttribute('r',String(Math.max(w,h)*.009));c.setAttribute('class','point');c.setAttribute('data-key',k);svg.append(c);
 const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',String(p.x*w+12));label.setAttribute('y',String(p.y*h-10));label.setAttribute('fill','#ffd08b');label.setAttribute('font-size',String(Math.max(w,h)*.014));label.textContent=k;svg.append(label);});
 output.textContent=JSON.stringify({version:1,image:'IMG_4604.jpeg',landmarks:points},null,2);
 localStorage.setItem(storeKey,JSON.stringify(points));
}
function position(e:PointerEvent){const r=svg.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};}
svg.addEventListener('pointerdown',e=>{const el=e.target as SVGElement;const key=el.getAttribute('data-key') as Key|null;if(!key)return;active=key;svg.setPointerCapture(e.pointerId);points[key]=position(e);draw();});
svg.addEventListener('pointermove',e=>{if(!active)return;points[active]=position(e);draw();});
const stop=()=>{active=null};svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
document.querySelector('#reset')!.addEventListener('click',()=>{points=structuredClone(defaults);draw();});
document.querySelector('#copy')!.addEventListener('click',async()=>{await navigator.clipboard.writeText(output.textContent||'');});
document.querySelector('#download')!.addEventListener('click',()=>{const blob=new Blob([output.textContent||''],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='piper-mouth-landmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
img.addEventListener('load',draw);draw();
