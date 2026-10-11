import presetData from '../data/expression-presets.json';
import originalUrl from '../IMG_4604.jpeg?url';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
const maps = import.meta.glob('../data/face-maps/*.json', { eager: true, import: 'default' }) as Record<string,FaceMap>;
const photos = import.meta.glob('../assets/expressions/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string,string>;
type Point = {x:number;y:number;z?:number};
type FaceImage = {role:string;filename:string;landmarks:Point[]};
type FaceMap = {expressionName?:string;images:FaceImage[]};
const $ = <T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const select=$<HTMLSelectElement>('expression'), original=$<HTMLImageElement>('original'), canvas=$<HTMLCanvasElement>('result');
const geometry=$<HTMLInputElement>('geometry'), texture=$<HTMLInputElement>('texture'), flush=$<HTMLInputElement>('flush'), status=$<HTMLElement>('status');
const ctx=canvas.getContext('2d')!;
const entries=Object.entries(maps).filter(([,m])=>m.images?.length===2&&m.images.every(i=>i.landmarks?.length===478)).sort(([a],[b])=>a.localeCompare(b));
for(const [path,m] of entries){const opt=document.createElement('option');opt.value=path;opt.textContent=m.expressionName||path.split('/').pop()!.replace('.json','');select.append(opt);}
const savedPresets=presetData.presets as Record<string,{geometry:number;texture:number;cheekWarmth:number}>;
function applyPreset(){const filename=select.value.split('/').pop()||'';const p=savedPresets[filename];geometry.value=String(p?.geometry??0);texture.value=String(p?.texture??0);flush.value=String(p?.cheekWarmth??0);for(const [id,input] of [['geometry-value',geometry],['texture-value',texture],['flush-value',flush]] as const)$(id).textContent=input.value+'%';status.textContent=p?'Saved preset loaded: '+filename+' (locked)':'No saved preset yet: '+filename;}
select.value=entries.find(([p])=>p.endsWith('/smile.json'))?.[0]||entries[0]?.[0]||'';
applyPreset();
original.src=originalUrl;
const ref=new Image();
let token=0;
const edges=FaceLandmarker.FACE_LANDMARKS_TESSELATION;
const adjacency=new Map<number,Set<number>>();
for(const e of edges){for(const [a,b] of [[e.start,e.end],[e.end,e.start]]){if(!adjacency.has(a))adjacency.set(a,new Set());adjacency.get(a)!.add(b);}}
const triangles:number[][]=[], seen=new Set<string>();
for(const [a,neighbors] of adjacency)for(const b of neighbors)for(const c of neighbors){if(b===c||!adjacency.get(b)?.has(c))continue;const ids=[a,b,c].sort((x,y)=>x-y),key=ids.join('-');if(!seen.has(key)){seen.add(key);triangles.push(ids);}}
function bounds(points:Point[]){const x=points.map(p=>p.x),y=points.map(p=>p.y);return {minX:Math.min(...x),minY:Math.min(...y),w:Math.max(...x)-Math.min(...x),h:Math.max(...y)-Math.min(...y)};}
function affine(a:Point,b:Point,c:Point,d:Point,e:Point,f:Point){const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);if(Math.abs(det)<1e-7)return null;const u=(e.x-d.x),v=(f.x-d.x),w=(e.y-d.y),z=(f.y-d.y);const A=(u*(c.y-a.y)-v*(b.y-a.y))/det,B=(w*(c.y-a.y)-z*(b.y-a.y))/det,C=(v*(b.x-a.x)-u*(c.x-a.x))/det,D=(z*(b.x-a.x)-w*(c.x-a.x))/det;return [A,B,C,D,d.x-A*a.x-C*a.y,d.y-B*a.x-D*a.y] as const;}
function paint(source:HTMLImageElement,from:Point[],to:Point[],alpha:number,overlap=0){if(!alpha)return;ctx.save();ctx.globalAlpha=alpha;for(const ids of triangles){const [i,j,k]=ids;const a=from[i],b=from[j],c=from[k],d=to[i],e=to[j],f=to[k];const matrix=affine(a,b,c,d,e,f);if(!matrix)continue;ctx.save();ctx.beginPath();const mx=(d.x+e.x+f.x)/3,my=(d.y+e.y+f.y)/3;const expand=(p:Point)=>{const dx=p.x-mx,dy=p.y-my,len=Math.hypot(dx,dy)||1;return {x:p.x+overlap*dx/len,y:p.y+overlap*dy/len};};const da=expand(d),ea=expand(e),fa=expand(f);ctx.moveTo(da.x,da.y);ctx.lineTo(ea.x,ea.y);ctx.lineTo(fa.x,fa.y);ctx.closePath();ctx.clip();ctx.setTransform(...matrix);ctx.drawImage(source,0,0);ctx.restore();}ctx.restore();}
let expressionBlend=1;
function render(){if(!original.complete||!original.naturalWidth)return;const m=maps[select.value];if(!m)return;const src=m.images.find(i=>i.role==='locked-original')?.landmarks, target=m.images.find(i=>i.role==='expression-reference')?.landmarks;if(!src||!target)return;
const w=original.naturalWidth,h=original.naturalHeight;canvas.width=w;canvas.height=h;ctx.drawImage(original,0,0);
const g=Number(geometry.value)/100*expressionBlend,t=Number(texture.value)/100*expressionBlend,f=Number(flush.value)/100*expressionBlend;
for(const [id,input] of [['geometry-value',geometry],['texture-value',texture],['flush-value',flush]] as const)$(id).textContent=input.value+'%';
if(!g&&!t&&!f)return;
const sb=bounds(src),tb=bounds(target),ratioX=sb.w/Math.max(tb.w,.001),ratioY=sb.h/Math.max(tb.h,.001);
const source=src.map(p=>({x:p.x*w,y:p.y*h}));
const destination=src.map((p,i)=>{const q=target[i];const nx=sb.minX+(q.x-tb.minX)*ratioX,ny=sb.minY+(q.y-tb.minY)*ratioY;return {x:(p.x+(nx-p.x)*g)*w,y:(p.y+(ny-p.y)*g)*h};});
if(g){ctx.clearRect(0,0,w,h);ctx.drawImage(original,0,0);paint(original,source,destination,1,select.value.endsWith('/smile.json')?0.7:0);}
if(t&&ref.complete&&ref.naturalWidth){const reference=target.map(p=>({x:p.x*ref.naturalWidth,y:p.y*ref.naturalHeight}));paint(ref,reference,destination,t*.55,select.value.endsWith('/smile.json')?0.7:0);}
if(f){const cheeks=[src[205],src[425],src[50],src[280]];ctx.save();ctx.globalCompositeOperation='source-over';for(const p of cheeks){const x=p.x*w,y=p.y*h,r=w*.09;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(221,79,92,'+(f*.22)+')');grad.addColorStop(1,'rgba(221,79,92,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(x,y,r,r*.7,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
}
function loadReference(){const id=++token;const m=maps[select.value];if(!m)return;const name=m.images.find(i=>i.role==='expression-reference')?.filename;const url=Object.entries(photos).find(([p])=>p.endsWith('/'+name))?.[1];if(!url){status.textContent='Reference image not found: '+name;render();return;}ref.onload=()=>{if(id!==token)return;status.textContent=(savedPresets[select.value.split('/').pop()||'']?'Saved preset ready: ':'Untuned expression: ')+(m.expressionName||select.selectedOptions[0]?.textContent);render();};ref.onerror=()=>{status.textContent='Reference photo failed to load';render();};ref.src=url;render();}
select.addEventListener('change',()=>{stopAnimation();applyPreset();loadReference();});
for(const control of [geometry,texture,flush])control.addEventListener('input',render);
original.decode().then(()=>{applyPreset();loadReference();render();}).catch(e=>status.textContent='Original image failed: '+String(e));

const playButton=$<HTMLButtonElement>('play-animation'),speed=$<HTMLSelectElement>('animation-speed');
const playable=entries.map(([path])=>path).filter(path=>Boolean(savedPresets[path.split('/').pop()||'']));
let playing=false,frame=0,cycleStart=0,cycleIndex=-1;
const ease=(x:number)=>x*x*(3-2*x);
function stopAnimation(){playing=false;cancelAnimationFrame(frame);expressionBlend=1;playButton.textContent='▶ Animate expressions';render();}
function nextExpression(){
 cycleIndex=(cycleIndex+1)%playable.length;
 select.value=playable[cycleIndex];applyPreset();loadReference();
 cycleStart=performance.now();expressionBlend=0;render();
}
function animate(now:number){
 if(!playing)return;
 const duration=Number(speed.value);
 const elapsed=now-cycleStart;
 // Rest -> expression -> hold -> rest, with the original portrait as resting.
 const rise=duration,hold=duration*.65,fall=duration;
 if(elapsed<rise)expressionBlend=ease(Math.min(1,elapsed/rise));
 else if(elapsed<rise+hold)expressionBlend=1;
 else if(elapsed<rise+hold+fall)expressionBlend=1-ease(Math.min(1,(elapsed-rise-hold)/fall));
 else {nextExpression();frame=requestAnimationFrame(animate);return;}
 render();frame=requestAnimationFrame(animate);
}
playButton.addEventListener('click',()=>{
 if(playing){stopAnimation();return;}
 if(!playable.length){status.textContent='No saved presets available';return;}
 playing=true;cycleIndex=playable.indexOf(select.value)-1;playButton.textContent='■ Stop animation';
 nextExpression();frame=requestAnimationFrame(animate);
});
