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
function paint(source:HTMLImageElement,from:Point[],to:Point[],alpha:number){if(!alpha)return;ctx.save();ctx.globalAlpha=alpha;for(const ids of triangles){const [i,j,k]=ids;const a=from[i],b=from[j],c=from[k],d=to[i],e=to[j],f=to[k];const matrix=affine(a,b,c,d,e,f);if(!matrix)continue;ctx.save();ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(e.x,e.y);ctx.lineTo(f.x,f.y);ctx.closePath();ctx.clip();ctx.setTransform(...matrix);ctx.drawImage(source,0,0);ctx.restore();}ctx.restore();}
function blendReference(source:HTMLImageElement,from:Point[],to:Point[],opacity:number){
 const w=canvas.width,h=canvas.height;
 const originalPixels=ctx.getImageData(0,0,w,h);
 ctx.clearRect(0,0,w,h);
 paint(source,from,to,1);
 const transfer=document.createElement('canvas');transfer.width=w;transfer.height=h;
 const tc=transfer.getContext('2d')!;tc.drawImage(canvas,0,0);
 ctx.putImageData(originalPixels,0,0);
 const lipIndices=[...new Set(FaceLandmarker.FACE_LANDMARKS_LIPS.flatMap(e=>[e.start,e.end]))];
 const lips=lipIndices.map(i=>to[i]);
 const lx=Math.min(...lips.map(p=>p.x)),rx=Math.max(...lips.map(p=>p.x));
 const ty=Math.min(...lips.map(p=>p.y)),by=Math.max(...lips.map(p=>p.y));
 const cx=(lx+rx)/2,cy=(ty+by)/2;
 const mw=Math.max(1,(rx-lx)*.8),mh=Math.max(1,(by-ty)*1.1);
 // Feather the reference mouth, including its teeth, over the original mouth.
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;
 const mc=mask.getContext('2d')!;mc.drawImage(transfer,0,0);
 mc.globalCompositeOperation='destination-in';
 mc.save();mc.translate(cx,cy);mc.scale(mw,mh);
 const mg=mc.createRadialGradient(0,0,.58,0,0,1);
 mg.addColorStop(0,'rgba(0,0,0,1)');mg.addColorStop(1,'rgba(0,0,0,0)');
 mc.fillStyle=mg;mc.beginPath();mc.arc(0,0,1,0,Math.PI*2);mc.fill();mc.restore();
 // Soft face boundary hides the abrupt edge of the mesh.
 const bx=Math.min(...to.map(p=>p.x)),ex=Math.max(...to.map(p=>p.x));
 const uy=Math.min(...to.map(p=>p.y)),dy=Math.max(...to.map(p=>p.y));
 const fx=(bx+ex)/2,fy=(uy+dy)/2,fw=(ex-bx)*.56,fh=(dy-uy)*.57;
 const face=document.createElement('canvas');face.width=w;face.height=h;
 const fc=face.getContext('2d')!;fc.drawImage(transfer,0,0);
 fc.globalCompositeOperation='destination-in';
 fc.save();fc.translate(fx,fy);fc.scale(fw,fh);
 const fg=fc.createRadialGradient(0,0,.65,0,0,1);
 fg.addColorStop(0,'rgba(0,0,0,1)');fg.addColorStop(1,'rgba(0,0,0,0)');
 fc.fillStyle=fg;fc.beginPath();fc.arc(0,0,1,0,Math.PI*2);fc.fill();fc.restore();
 ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(face,0,0);ctx.restore();
 ctx.drawImage(mask,0,0);
}
function render(){if(!original.complete||!original.naturalWidth)return;const m=maps[select.value];if(!m)return;const src=m.images.find(i=>i.role==='locked-original')?.landmarks, target=m.images.find(i=>i.role==='expression-reference')?.landmarks;if(!src||!target)return;
const w=original.naturalWidth,h=original.naturalHeight;canvas.width=w;canvas.height=h;ctx.drawImage(original,0,0);
const g=Number(geometry.value)/100,t=Number(texture.value)/100,f=Number(flush.value)/100;
for(const [id,input] of [['geometry-value',geometry],['texture-value',texture],['flush-value',flush]] as const)$(id).textContent=input.value+'%';
if(!g&&!t&&!f)return;
const sb=bounds(src),tb=bounds(target),ratioX=sb.w/Math.max(tb.w,.001),ratioY=sb.h/Math.max(tb.h,.001);
const source=src.map(p=>({x:p.x*w,y:p.y*h}));
const destination=src.map((p,i)=>{const q=target[i];const nx=sb.minX+(q.x-tb.minX)*ratioX,ny=sb.minY+(q.y-tb.minY)*ratioY;return {x:(p.x+(nx-p.x)*g)*w,y:(p.y+(ny-p.y)*g)*h};});
if(g){ctx.clearRect(0,0,w,h);ctx.drawImage(original,0,0);paint(original,source,destination,1);}
if(t&&ref.complete&&ref.naturalWidth){const reference=target.map(p=>({x:p.x*ref.naturalWidth,y:p.y*ref.naturalHeight}));blendReference(ref,reference,destination,t*.55);}
if(f){const cheeks=[src[205],src[425],src[50],src[280]];ctx.save();ctx.globalCompositeOperation='source-over';for(const p of cheeks){const x=p.x*w,y=p.y*h,r=w*.09;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(221,79,92,'+(f*.22)+')');grad.addColorStop(1,'rgba(221,79,92,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(x,y,r,r*.7,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
}
function loadReference(){const id=++token;const m=maps[select.value];if(!m)return;const name=m.images.find(i=>i.role==='expression-reference')?.filename;const url=Object.entries(photos).find(([p])=>p.endsWith('/'+name))?.[1];if(!url){status.textContent='Reference image not found: '+name;render();return;}ref.onload=()=>{if(id!==token)return;status.textContent=(savedPresets[select.value.split('/').pop()||'']?'Saved preset ready: ':'Untuned expression: ')+(m.expressionName||select.selectedOptions[0]?.textContent);render();};ref.onerror=()=>{status.textContent='Reference photo failed to load';render();};ref.src=url;render();}
select.addEventListener('change',()=>{applyPreset();loadReference();});
for(const control of [geometry,texture,flush])control.addEventListener('input',render);
original.decode().then(()=>{applyPreset();loadReference();render();}).catch(e=>status.textContent='Original image failed: '+String(e));
