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
// Lab-only audition: sliders update the preview without saving locked presets.
for(const input of [geometry,texture,flush])input.addEventListener('input',()=>render());
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
function paint(source:HTMLImageElement,from:Point[],to:Point[],alpha:number,overlap=0,out:CanvasRenderingContext2D=ctx){if(!alpha)return;out.save();out.globalAlpha=alpha;for(const ids of triangles){const [i,j,k]=ids;const a=from[i],b=from[j],c=from[k],d=to[i],e=to[j],f=to[k];const matrix=affine(a,b,c,d,e,f);if(!matrix)continue;out.save();out.beginPath();const mx=(d.x+e.x+f.x)/3,my=(d.y+e.y+f.y)/3;const expand=(p:Point)=>{const dx=p.x-mx,dy=p.y-my,len=Math.hypot(dx,dy)||1;return {x:p.x+overlap*dx/len,y:p.y+overlap*dy/len};};const da=expand(d),ea=expand(e),fa=expand(f);out.moveTo(da.x,da.y);out.lineTo(ea.x,ea.y);out.lineTo(fa.x,fa.y);out.closePath();out.clip();out.setTransform(...matrix);out.drawImage(source,0,0);out.restore();}out.restore();}

// Isolated reference-mouth layer: replace the ghosted interior with one source mouth.
// The soft oval mask avoids the hard rectangular boundaries of earlier experiments.
const mouthCanvas=document.createElement('canvas');
const mouthCtx=mouthCanvas.getContext('2d')!;
const lipIndices=[...new Set(FaceLandmarker.FACE_LANDMARKS_LIPS.flatMap(e=>[e.start,e.end]))];

function paintContinuousMouth(reference:Point[],destination:Point[],strength:number,w:number,h:number){
 if(strength<=0)return;
 const refPts=lipIndices.map(i=>reference[i]),dstPts=lipIndices.map(i=>destination[i]);
 const box=(pts:Point[])=>({left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))});
 const a=box(refPts),b=box(dstPts);
 const aw=Math.max(1,a.right-a.left),ah=Math.max(1,a.bottom-a.top);
 const bw=Math.max(1,b.right-b.left),bh=Math.max(1,b.bottom-b.top);
 const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
 const rx=bw*.69,ry=bh*.96;
 // Copy actual reference teeth and mouth as one continuous image, not a triangulated lip mesh.
 mouthCanvas.width=w;mouthCanvas.height=h;
 mouthCtx.save();
 mouthCtx.translate(cx,cy);
 mouthCtx.scale(bw/aw,bh/ah);
 mouthCtx.translate(-(a.left+a.right)/2,-(a.top+a.bottom)/2);
 mouthCtx.drawImage(ref,0,0);
 mouthCtx.restore();
 mouthCtx.globalCompositeOperation='destination-in';
 mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx,ry);
 const mask=mouthCtx.createRadialGradient(0,0,.70,0,0,1);
 mask.addColorStop(.70,'#000');mask.addColorStop(1,'transparent');
 mouthCtx.fillStyle=mask;mouthCtx.beginPath();mouthCtx.arc(0,0,1,0,Math.PI*2);mouthCtx.fill();
 mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=Math.min(1,strength);ctx.drawImage(mouthCanvas,0,0);ctx.restore();
}

function paintMouth(reference:Point[],destination:Point[],strength:number,w:number,h:number){
 if(strength<=0)return;
 const pts=lipIndices.map(i=>destination[i]);
 const left=Math.min(...pts.map(p=>p.x)),right=Math.max(...pts.map(p=>p.x));
 const top=Math.min(...pts.map(p=>p.y)),bottom=Math.max(...pts.map(p=>p.y));
 const cx=(left+right)/2,cy=(top+bottom)/2;
 const rx=Math.max(2,(right-left)*.61),ry=Math.max(2,(bottom-top)*.77);
 mouthCanvas.width=w;mouthCanvas.height=h;
 paint(ref,reference,destination,1,.45,mouthCtx);
 mouthCtx.globalCompositeOperation='destination-in';
 const radius=Math.max(rx,ry);
 // Elliptical radial falloff: full reference mouth at center, feathered lip perimeter.
 mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx/radius,ry/radius);
 const mask=mouthCtx.createRadialGradient(0,0,radius*.58,0,0,radius);
 mask.addColorStop(0,'rgba(0,0,0,1)');mask.addColorStop(1,'rgba(0,0,0,0)');
 mouthCtx.fillStyle=mask;mouthCtx.beginPath();mouthCtx.arc(0,0,radius,0,Math.PI*2);mouthCtx.fill();
 mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=Math.min(1,strength);ctx.drawImage(mouthCanvas,0,0);ctx.restore();
}
// Full Laugh only: feather reference texture out before the upper forehead/hairline.
const foreheadCanvas=document.createElement('canvas');
const foreheadCtx=foreheadCanvas.getContext('2d')!;
function paintFeatheredForeheadTexture(reference:Point[],destination:Point[],alpha:number,w:number,h:number){
 foreheadCanvas.width=w;foreheadCanvas.height=h;
 paint(ref,reference,destination,1,0,foreheadCtx);
 // Keep the cheeks and lower face; gradually restore the original forehead.
 const browY=Math.min(destination[70].y,destination[300].y);
 const fadeStart=Math.max(0,browY-h*.12),fadeEnd=browY+h*.045;
 foreheadCtx.globalCompositeOperation='destination-in';
 const grad=foreheadCtx.createLinearGradient(0,fadeStart,0,fadeEnd);
 grad.addColorStop(0,'rgba(0,0,0,0)');
 grad.addColorStop(1,'rgba(0,0,0,1)');
 foreheadCtx.fillStyle=grad;foreheadCtx.fillRect(0,0,w,h);
 foreheadCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(foreheadCanvas,0,0);ctx.restore();
}
// Restrict repairs to expressions that failed visual QA. Approved expressions stay untouched.
const mouthRepairs=new Set(['full-smile.json','surprised.json','excited.json','smile.json','horny.json']);
const foreheadRepairs=new Set(['full-laugh.json','flush.json','thinking.json','horny.json']);
// Bite 04.0: viseme reference photos and their scanned landmarks. Speech only paints the mouth.
const visemeMaps = import.meta.glob('../assets/visemes/*.json', { eager:true, import:'default' }) as Record<string,FaceMap>;
const visemePhotos = import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}', { eager:true, query:'?url', import:'default' }) as Record<string,string>;
type SpeechViseme = 'oo'|'mbp'|'ah'|'ee'|'fv';
const visemeOrder:SpeechViseme[]=['oo','mbp','ah','ee','fv'];
const visemeAssets = new Map<SpeechViseme,{map:FaceMap;image:HTMLImageElement}>();
for(const name of visemeOrder){
 const map=Object.entries(visemeMaps).find(([p])=>p.endsWith('/'+name+'.json'))?.[1];
 const filename=map?.images.find(i=>i.role==='expression-reference')?.filename;
 const url=Object.entries(visemePhotos).find(([p])=>p.endsWith('/'+filename))?.[1];
 if(!map||!url||map.images.some(i=>i.landmarks?.length!==478))continue;
 const image=new Image();image.src=url;image.onload=()=>{if(speechPlaying)render();};
 visemeAssets.set(name,{map,image});
}
const speechButton=$<HTMLButtonElement>('play-speech'),speechLabel=$<HTMLElement>('speech-shape');
let speechPlaying=false,speechFrame=0,speechStart=0,speechLast=0,speechAmount=0;
let speechShape:SpeechViseme|'rest'='rest';
type VisemeTuning={x:number;y:number;width:number;height:number;feather:number;blend:number};
const tuningDefaults=():VisemeTuning=>({x:0,y:0,width:100,height:100,feather:57,blend:100});
// Approved 2026-10-11 from visible iPhone slider readings; MBP remains at defaults.
const approvedVisemeTuning:Record<SpeechViseme,VisemeTuning>={
 oo:{x:0,y:-26,width:100,height:100,feather:57,blend:100},
 mbp:tuningDefaults(),
 ah:{x:0,y:-41,width:96,height:95,feather:57,blend:100},
 ee:{x:0,y:-28,width:106,height:100,feather:57,blend:100},
 fv:{x:0,y:-17,width:100,height:100,feather:57,blend:100}
};
const visemeTuning=Object.fromEntries(visemeOrder.map(name=>[name,{...approvedVisemeTuning[name]}])) as Record<SpeechViseme,VisemeTuning>;
const calibrationSelect=$<HTMLSelectElement>('viseme-calibration-shape');
const calibrationControls=(['x','y','width','height','feather','blend'] as const).map(key=>({key,input:$<HTMLInputElement>('viseme-'+key),output:$<HTMLOutputElement>('viseme-'+key+'-value')}));
let calibrationShape:SpeechViseme='oo',calibrationPreview=false;
function syncCalibration(){
 calibrationShape=calibrationSelect.value as SpeechViseme;
 const tune=visemeTuning[calibrationShape];
 for(const {key,input,output} of calibrationControls){input.value=String(tune[key]);output.textContent=String(tune[key])+(key==='x'||key==='y'?' px':'%');}
 render();
}
calibrationSelect.addEventListener('change',()=>{stopSpeech();calibrationPreview=true;syncCalibration();});
for(const {key,input} of calibrationControls)input.addEventListener('input',()=>{
 visemeTuning[calibrationShape][key]=Number(input.value);calibrationPreview=true;
 const output=$<HTMLOutputElement>('viseme-'+key+'-value');
 output.textContent=input.value+(key==='x'||key==='y'?' px':'%');render();
});
$('viseme-preview').addEventListener('click',()=>{stopSpeech();calibrationPreview=!calibrationPreview;$('viseme-preview').textContent=calibrationPreview?'Hide selected mouth':'Preview selected mouth';render();});
$('viseme-reset').addEventListener('click',()=>{visemeTuning[calibrationShape]=tuningDefaults();calibrationPreview=true;syncCalibration();});
$('viseme-copy').addEventListener('click',()=>{
 const data=JSON.stringify({shape:calibrationShape,...visemeTuning[calibrationShape]});
 const field=$<HTMLTextAreaElement>('viseme-values');field.value=data;field.select();
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(data).catch(()=>{});
});
const visemeCanvas=document.createElement('canvas'),visemeCtx=visemeCanvas.getContext('2d')!;
const smooth=(x:number)=>{const q=Math.max(0,Math.min(1,x));return q*q*(3-2*q);};
function paintViseme(destination:Point[],w:number,h:number){
 if(!calibrationPreview&&(!speechPlaying||speechShape==='rest'||speechAmount<.002))return;
 const shape=calibrationPreview?calibrationShape:speechShape;
 if(shape==='rest')return;
 const tune=visemeTuning[shape];
 const asset=visemeAssets.get(shape);if(!asset||!asset.image.complete||!asset.image.naturalWidth)return;
 const source=asset.map.images.find(i=>i.role==='locked-original')?.landmarks;
 const target=asset.map.images.find(i=>i.role==='expression-reference')?.landmarks;
 if(!source||!target)return;
 // Align full reference face using eye and nose anchors, never by stretching the portrait.
 const anchors=[33,263,1,168];
 const avg=(points:Point[])=>anchors.reduce((p,i)=>({x:p.x+points[i].x/anchors.length,y:p.y+points[i].y/anchors.length}),{x:0,y:0});
 const sc=avg(source),tc=avg(target);
 const distance=(p:Point[])=>Math.hypot(p[263].x-p[33].x,p[263].y-p[33].y);
 const scale=distance(source)/Math.max(.001,distance(target));
 const align=(p:Point)=>({x:sc.x+(p.x-tc.x)*scale,y:sc.y+(p.y-tc.y)*scale});
 const srcBox=(indices:number[],points:Point[])=>{const xs=indices.map(i=>points[i].x),ys=indices.map(i=>points[i].y);return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};};
 const refBox=srcBox(lipIndices,target);
 // Keep all expression geometry outside the lips. Apply only viseme-vs-rest mouth deltas.
 const mouth=lipIndices.map(i=>{const aligned=align(target[i]);return {x:destination[i].x+(aligned.x-source[i].x)*w,y:destination[i].y+(aligned.y-source[i].y)*h};});
 const x0=Math.min(...mouth.map(p=>p.x)),x1=Math.max(...mouth.map(p=>p.x));
 const y0=Math.min(...mouth.map(p=>p.y)),y1=Math.max(...mouth.map(p=>p.y));
 const bw=Math.max(1,x1-x0),bh=Math.max(1,y1-y0);
 const rw=Math.max(.001,refBox.right-refBox.left),rh=Math.max(.001,refBox.bottom-refBox.top);
 const mouthScale=.85;
 const cx=(destination[61].x+destination[291].x)/2+tune.x,cy=destination[0].y-(target[0].y-(refBox.top+refBox.bottom)/2)*bh/rh-10+tune.y;
 visemeCanvas.width=w;visemeCanvas.height=h;
 visemeCtx.save();
 visemeCtx.translate(cx,cy);
 visemeCtx.scale(bw*mouthScale*tune.width/100/(rw*asset.image.naturalWidth),bh*mouthScale*tune.height/100/(rh*asset.image.naturalHeight));
 visemeCtx.translate(-(refBox.left+refBox.right)*asset.image.naturalWidth/2,-(refBox.top+refBox.bottom)*asset.image.naturalHeight/2);
 visemeCtx.drawImage(asset.image,0,0);visemeCtx.restore();
 // Soft feather restricts reference pixels to lips and immediate mouth contour.
 visemeCtx.globalCompositeOperation='destination-in';
 visemeCtx.save();visemeCtx.translate(cx,cy);visemeCtx.scale(Math.max(2,bw*.66*mouthScale*tune.width/100),Math.max(2,bh*.94*mouthScale*tune.height/100));
 const mask=visemeCtx.createRadialGradient(0,0,.57,0,0,1);
 mask.addColorStop(0,'#000');mask.addColorStop(1,'transparent');
 visemeCtx.fillStyle=mask;visemeCtx.beginPath();visemeCtx.arc(0,0,1,0,Math.PI*2);visemeCtx.fill();
 visemeCtx.restore();visemeCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=(calibrationPreview?1:speechAmount)*tune.blend/100;ctx.drawImage(visemeCanvas,0,0);ctx.restore();
}
function stopSpeech(){speechPlaying=false;cancelAnimationFrame(speechFrame);speechAmount=0;speechShape='rest';speechLabel.textContent='Rest';speechButton.textContent='▶ Test mapped visemes';render();}
function animateSpeech(now:number){
 if(!speechPlaying)return;
 const period=850,elapsed=now-speechStart,index=Math.floor(elapsed/period)%visemeOrder.length;
 speechShape=visemeOrder[index];
 const phase=(elapsed%period)/period;
 const goal=smooth(Math.min(1,phase/.23))*smooth(Math.min(1,(1-phase)/.23));
 const dt=speechLast?Math.min(64,now-speechLast):16;speechLast=now;
 speechAmount+=(goal-speechAmount)*(1-Math.exp(-dt/65));
 speechLabel.textContent=speechShape.toUpperCase();if(!playing)render();
 speechFrame=requestAnimationFrame(animateSpeech);
}
speechButton.addEventListener('click',()=>{calibrationPreview=false;$('viseme-preview').textContent='Preview selected mouth';
 if(speechPlaying){stopSpeech();return;}
 if(visemeAssets.size!==visemeOrder.length){status.textContent='Missing viseme JSON or matching reference photos. Found '+visemeAssets.size+'/5.';return;}
 stopAnimation();speechPlaying=true;speechStart=performance.now();speechLast=0;
 speechButton.textContent='■ Stop viseme test';speechFrame=requestAnimationFrame(animateSpeech);
});
let expressionBlend=1;
function render(){if(!original.complete||!original.naturalWidth)return;const m=maps[select.value];if(!m)return;const src=m.images.find(i=>i.role==='locked-original')?.landmarks, target=m.images.find(i=>i.role==='expression-reference')?.landmarks;if(!src||!target)return;
const w=original.naturalWidth,h=original.naturalHeight;canvas.width=w;canvas.height=h;ctx.drawImage(original,0,0);
const g=Number(geometry.value)/100*expressionBlend,t=Number(texture.value)/100*expressionBlend,f=Number(flush.value)/100*expressionBlend;
for(const [id,input] of [['geometry-value',geometry],['texture-value',texture],['flush-value',flush]] as const)$(id).textContent=input.value+'%';
if(!g&&!t&&!f&&!speechPlaying&&!calibrationPreview)return;
const sb=bounds(src),tb=bounds(target),ratioX=sb.w/Math.max(tb.w,.001),ratioY=sb.h/Math.max(tb.h,.001);
const source=src.map(p=>({x:p.x*w,y:p.y*h}));
const destination=src.map((p,i)=>{const q=target[i];const nx=sb.minX+(q.x-tb.minX)*ratioX,ny=sb.minY+(q.y-tb.minY)*ratioY;return {x:(p.x+(nx-p.x)*g)*w,y:(p.y+(ny-p.y)*g)*h};});
if(g){
 ctx.clearRect(0,0,w,h);ctx.drawImage(original,0,0);
 if(foreheadRepairs.has(select.value.split('/').pop()||'')){
  // Warp the lower face as before, but fade the geometry to zero above the brows.
  // Preserve the original hairline and upper forehead; mouth rendering stays unchanged.
  const layer=document.createElement('canvas');layer.width=w;layer.height=h;
  const layerCtx=layer.getContext('2d')!;
  paint(original,source,destination,1,0,layerCtx);
  const browY=Math.min(destination[70].y,destination[300].y);
  const fadeStart=Math.max(0,browY-h*.13),fadeEnd=browY+h*.06;
  layerCtx.globalCompositeOperation='destination-in';
  const fade=layerCtx.createLinearGradient(0,fadeStart,0,fadeEnd);
  fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');
  layerCtx.fillStyle=fade;layerCtx.fillRect(0,0,w,h);
  layerCtx.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);
 }else paint(original,source,destination,1,select.value.endsWith('/smile.json')?0.7:0);
}
// Embarrassed 2 reference contains a hand: use its landmarks for motion only.
// Do not transfer occluding hand pixels into the portrait.
if(t&&ref.complete&&ref.naturalWidth&&!select.value.endsWith('/embarrassed2.json')){const reference=target.map(p=>({x:p.x*ref.naturalWidth,y:p.y*ref.naturalHeight}));if(foreheadRepairs.has(select.value.split('/').pop()||''))paintFeatheredForeheadTexture(reference,destination,t*.55,w,h);else paint(ref,reference,destination,t*.55,select.value.endsWith('/smile.json')?0.7:0);// Historical fix 58c25b5: avoid a second expression-mouth repair layer when a speech mouth is active.
 if(!calibrationPreview&&(!speechPlaying||speechShape==='rest'||speechAmount<.002)){
  if(select.value.endsWith('/full-laugh.json')||mouthRepairs.has(select.value.split('/').pop()||''))paintContinuousMouth(reference,destination,expressionBlend,w,h);
  else paintMouth(reference,destination,expressionBlend,w,h);
 }}
if(f){const cheeks=[src[205],src[425],src[50],src[280]];ctx.save();ctx.globalCompositeOperation='source-over';for(const p of cheeks){const x=p.x*w,y=p.y*h,r=w*.09;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(221,79,92,'+(f*.22)+')');grad.addColorStop(1,'rgba(221,79,92,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(x,y,r,r*.7,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
paintViseme(destination,w,h);
}
function loadReference(){const id=++token;const m=maps[select.value];if(!m)return;const name=m.images.find(i=>i.role==='expression-reference')?.filename;const url=Object.entries(photos).find(([p])=>p.endsWith('/'+name))?.[1];if(!url){status.textContent='Reference image not found: '+name;render();return;}ref.onload=()=>{if(id!==token)return;status.textContent=(savedPresets[select.value.split('/').pop()||'']?'Saved preset ready: ':'Untuned expression: ')+(m.expressionName||select.selectedOptions[0]?.textContent);render();};ref.onerror=()=>{status.textContent='Reference photo failed to load';render();};ref.src=url;render();}
select.addEventListener('change',()=>{stopSpeech();stopAnimation();applyPreset();loadReference();});
for(const control of [geometry,texture,flush])control.addEventListener('input',render);
original.decode().then(()=>{applyPreset();loadReference();syncCalibration();render();}).catch(e=>status.textContent='Original image failed: '+String(e));

const playButton=$<HTMLButtonElement>('play-animation'),speed=$<HTMLSelectElement>('animation-speed');
const playable=entries.map(([path])=>path).filter(path=>Boolean(savedPresets[path.split('/').pop()||'']));
let playing=false,frame=0,cycleStart=0,cycleIndex=-1;
const expressionTiming:Record<string,[number,number,number]>={
 'surprised.json':[.45,.65,.8], 'excited.json':[.65,.85,.9],
 'full-laugh.json':[.7,1.15,1], 'full-smile.json':[.9,1.35,1.1],
 'smile.json':[1,1.3,1.2], 'smile2.json':[1,1.25,1.2],
 'sad.json':[1.5,1.5,1.5], 'sad2.json':[1.5,1.5,1.5],
 'thinking.json':[1.25,1.5,1.3], 'curious.json':[.85,1.1,1],
 'mad.json':[.7,1.3,1.2]
};
const ease=(x:number)=>x*x*(3-2*x);
let lastAuditionPaint=0;
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
 const name=select.value.split('/').pop()||'';
 const [inFactor,holdFactor,outFactor]=expressionTiming[name]||[1,1,1.1];
 const rise=duration*inFactor,hold=duration*.65*holdFactor,fall=duration*outFactor;
 if(elapsed<rise)expressionBlend=ease(Math.min(1,elapsed/rise));
 else if(elapsed<rise+hold){const phase=(elapsed-rise)/Math.max(hold,1);expressionBlend=1-.018*Math.sin(Math.PI*phase)**2;}
 else if(elapsed<rise+hold+fall)expressionBlend=1-ease(Math.min(1,(elapsed-rise-hold)/fall));
 else {nextExpression();frame=requestAnimationFrame(animate);return;}
 // Target 60 FPS for the combined expression + mouth canvas (display permitting).
 if(now-lastAuditionPaint>=1000/60){lastAuditionPaint=now;render();}frame=requestAnimationFrame(animate);
}
playButton.addEventListener('click',()=>{
 if(playing){stopAnimation();return;}
 if(!playable.length){status.textContent='No saved presets available';return;}
 stopSpeech();playing=true;cycleIndex=playable.indexOf(select.value)-1;playButton.textContent='■ Stop animation';
 nextExpression();frame=requestAnimationFrame(animate);
});


 // Static OO-only experiment. Never deform the source photograph or touch saved presets.
 // Align by interocular distance, then transplant a single continuous photographic
 // lower-face region with an opaque center that fully covers the original lips.
 const ooButton=$<HTMLButtonElement>('test-oo-static');
 let ooStatic=false;
 function renderStaticOO(){
  const asset=visemeAssets.get('oo');
  if(!asset?.image.complete||!asset.image.naturalWidth||!original.complete||!original.naturalWidth)return;
  const source=asset.map.images.find(i=>i.role==='locked-original')?.landmarks;
  const target=asset.map.images.find(i=>i.role==='expression-reference')?.landmarks;
  if(!source||!target)return;
  const w=original.naturalWidth,h=original.naturalHeight;
  canvas.width=w;canvas.height=h;ctx.drawImage(original,0,0);
  const px=(p:Point)=>({x:p.x*w,y:p.y*h});
  const eyeDist=(p:Point[])=>Math.hypot(p[263].x-p[33].x,p[263].y-p[33].y);
  const scale=eyeDist(source)/Math.max(.001,eyeDist(target));
  const srcMouth=px(source[0]),refMouth=px(target[0]);
  // Uniform scaling only: retain the real photographic mouth anatomy.
  const centerX=srcMouth.x+approvedVisemeTuning.oo.x;
  const centerY=srcMouth.y+approvedVisemeTuning.oo.y;
  const mouthWidth=Math.hypot(source[291].x-source[61].x,source[291].y-source[61].y)*w;
  const lipY=lipIndices.map(i=>source[i].y*h);
  const lipHeight=Math.max(...lipY)-Math.min(...lipY);
  const rx=Math.max(mouthWidth*.90,lipHeight*1.3),ry=Math.max(lipHeight*2.2,mouthWidth*.53);
  const layer=document.createElement('canvas');layer.width=w;layer.height=h;
  const c=layer.getContext('2d')!;
  c.save();c.translate(centerX,centerY);c.scale(scale,scale);
  c.translate(-refMouth.x,-refMouth.y);c.drawImage(asset.image,0,0);c.restore();
  // Broad soft mask: fully replaces both original lips and their shadows.
  c.globalCompositeOperation='destination-in';
  c.save();c.translate(centerX,centerY);c.scale(rx,ry);
  const matte=c.createRadialGradient(0,0,.63,0,0,1);
  matte.addColorStop(0,'rgba(0,0,0,1)');matte.addColorStop(.63,'rgba(0,0,0,1)');
  matte.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=matte;c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fill();c.restore();
  ctx.drawImage(layer,0,0);
  status.textContent='Static OO experiment: uniform photo alignment, original mouth covered. No mesh deformation.';
 }
 ooButton.addEventListener('click',()=>{
  ooStatic=!ooStatic;
  if(ooStatic){stopAnimation();stopSpeech();ooButton.textContent='↩ Return to audition';renderStaticOO();}
  else {ooButton.textContent='◉ Test static OO mouth';render();}
 });

 // Bite 04.5: independent clocks for approved expressions and calibrated visemes.
 const auditionButton=$<HTMLButtonElement>('play-audition');
 let auditionPlaying=false;
 auditionButton.addEventListener('click',()=>{
  if(auditionPlaying){
   auditionPlaying=false;stopAnimation();stopSpeech();
   auditionButton.textContent='▶ Play audition';return;
  }
  if(!playable.length||visemeAssets.size!==visemeOrder.length){
   status.textContent='Audition assets incomplete: expressions '+playable.length+', visemes '+visemeAssets.size+'/5';return;
  }
  calibrationPreview=false;stopAnimation();stopSpeech();
  auditionPlaying=true;playing=true;
  cycleIndex=playable.indexOf(select.value)-1;
  nextExpression();frame=requestAnimationFrame(animate);
  speechPlaying=true;speechStart=performance.now();speechLast=0;speechAmount=0;
  speechFrame=requestAnimationFrame(animateSpeech);
  auditionButton.textContent='■ Stop audition';
 });

// Bite 04.6: independent, locally durable 17 × 5 combination calibration studio.
// Never mutate the approved expression presets or the five base viseme calibrations.
type CombinationRecord={tuning:VisemeTuning;approved:boolean;updatedAt:string};
const studioStorageKey='piper-oasis-combinations-v1';
const studioRecords:Record<string,CombinationRecord>={};
try {
 const stored=JSON.parse(localStorage.getItem(studioStorageKey)||'{}');
 if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
  for(const [key,value] of Object.entries(stored)){
   const record=value as CombinationRecord;
   if(record?.tuning&&typeof record.approved==='boolean'&&
      (['x','y','width','height','feather','blend'] as const).every(k=>Number.isFinite(record.tuning[k])))
    studioRecords[key]=record;
  }
 }
}catch(e){console.warn('Combination storage could not be loaded',e);}
const studioExpression=$<HTMLSelectElement>('studio-expression');
const studioShape=$<HTMLSelectElement>('studio-shape');
const studioStatus=$<HTMLElement>('studio-status');
const studioCount=$<HTMLElement>('studio-count');
const studioSliders=(['x','y','width','height','feather','blend'] as const).map(key=>({
 key,input:$<HTMLInputElement>('studio-'+key),output:$<HTMLElement>('studio-'+key+'-value')
}));
for(const [path,map] of entries){
 const option=document.createElement('option');option.value=path;
 option.textContent=map.expressionName||path.split('/').pop()!.replace('.json','');
 studioExpression.append(option);
}
for(const shape of visemeOrder){const option=document.createElement('option');option.value=shape;option.textContent=shape.toUpperCase();studioShape.append(option);}
studioExpression.value=select.value;studioShape.value='oo';
let studioActive=false;
const studioKey=()=>studioExpression.value.split('/').pop()+'|'+studioShape.value;
const studioTotal=entries.length*visemeOrder.length;
const studioPersist=()=>{
 try{localStorage.setItem(studioStorageKey,JSON.stringify(studioRecords));return true;}
 catch(e){studioStatus.textContent='Storage failed. Export your calibration JSON before leaving this page.';return false;}
};
function studioRefreshCount(){
 const valid=new Set(entries.flatMap(([path])=>visemeOrder.map(shape=>path.split('/').pop()+'|'+shape)));
 const approved=Object.entries(studioRecords).filter(([key,r])=>valid.has(key)&&r.approved).length;
 studioCount.textContent=approved+' / '+studioTotal+' approved';
}
function studioRead(){
 const record=studioRecords[studioKey()];
 const values=record?.tuning||approvedVisemeTuning[studioShape.value as SpeechViseme];
 for(const {key,input,output} of studioSliders){input.value=String(values[key]);output.textContent=String(values[key])+(key==='x'||key==='y'?' px':'%');}
 studioStatus.textContent=record?(record.approved?'Approved and saved':'Draft saved, not approved'):'Not yet calibrated. Starting from the approved base mouth.';
 studioRefreshCount();
}
function studioShow(){
 studioActive=true;
 stopAnimation();stopSpeech();
 select.value=studioExpression.value;applyPreset();loadReference();
 calibrationShape=studioShape.value as SpeechViseme;
 const record=studioRecords[studioKey()];
 visemeTuning[calibrationShape]={...(record?.tuning||approvedVisemeTuning[calibrationShape])};
 calibrationPreview=true;studioRead();render();
}
for(const element of [studioExpression,studioShape])element.addEventListener('change',studioShow);
for(const {key,input,output} of studioSliders)input.addEventListener('input',()=>{
 if(!studioActive)studioShow();
 const shape=studioShape.value as SpeechViseme;
 const current=studioRecords[studioKey()]?.tuning||{...approvedVisemeTuning[shape]};
 const tuning={...current,[key]:Number(input.value)};
 studioRecords[studioKey()]={tuning,approved:false,updatedAt:new Date().toISOString()};
 visemeTuning[shape]={...tuning};
 output.textContent=input.value+(key==='x'||key==='y'?' px':'%');
 if(studioPersist())studioStatus.textContent='Draft autosaved on this device. Approval required.';
 studioRefreshCount();render();
});
$('studio-approve').addEventListener('click',()=>{
 if(!studioActive)studioShow();
 const shape=studioShape.value as SpeechViseme;
 const tuning=studioRecords[studioKey()]?.tuning||{...approvedVisemeTuning[shape]};
 studioRecords[studioKey()]={tuning:{...tuning},approved:true,updatedAt:new Date().toISOString()};
 if(studioPersist()){studioStatus.textContent='Approved and saved on this device. Export a backup to preserve it elsewhere.';studioRefreshCount();}
});
$('studio-next').addEventListener('click',()=>{
 const previousTuning={...visemeTuning[studioShape.value as SpeechViseme]};
 const index=entries.findIndex(([path])=>path===studioExpression.value);
 const shapeIndex=visemeOrder.indexOf(studioShape.value as SpeechViseme);
 if(shapeIndex<visemeOrder.length-1)studioShape.value=visemeOrder[shapeIndex+1];
 else{studioShape.value=visemeOrder[0];studioExpression.value=entries[(index+1)%entries.length][0];}
 // New combinations inherit the preceding adjustment without overwriting saved work.
 if(!studioRecords[studioKey()]){
  studioRecords[studioKey()]={tuning:previousTuning,approved:false,updatedAt:new Date().toISOString()};
  studioPersist();
 }
 studioShow();
});
$('studio-inherit').addEventListener('click',()=>{
 const shape=studioShape.value as SpeechViseme;
 const tuning={...visemeTuning[shape]};
 studioRecords[studioKey()]={tuning,approved:false,updatedAt:new Date().toISOString()};
 studioPersist();studioShow();
 studioStatus.textContent='Current settings copied as a draft. Adjust and approve when ready.';
});
$('studio-export').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify({format:'piper-combination-studio-v1',records:studioRecords},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='piper-85-combinations-backup.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$<HTMLInputElement>('studio-import').addEventListener('change',async event=>{
 const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
 try{
  const payload=JSON.parse(await file.text());
  if(payload?.format!=='piper-combination-studio-v1'||!payload.records||typeof payload.records!=='object')throw Error('Invalid studio backup');
  const allowed=new Set(entries.flatMap(([path])=>visemeOrder.map(shape=>path.split('/').pop()+'|'+shape)));
  let imported=0;
  for(const [key,value] of Object.entries(payload.records)){
   const record=value as CombinationRecord;
   if(!allowed.has(key)||!record?.tuning||typeof record.approved!=='boolean'||
      !(['x','y','width','height','feather','blend'] as const).every(k=>Number.isFinite(record.tuning[k])))continue;
   studioRecords[key]={tuning:{...record.tuning},approved:record.approved,updatedAt:String(record.updatedAt||'')};imported++;
  }
  if(!studioPersist())return;
  studioShow();studioStatus.textContent=imported+' combinations imported. Existing matching records were replaced.';
 }catch(e){studioStatus.textContent='Import failed: '+String(e);}
 finally{input.value='';}
});
$('studio-open').addEventListener('click',studioShow);
studioRefreshCount();

// Bite 04.7: strict sequential five-state audition. Exactly one facial state per frame.
const sequenceButton=$<HTMLButtonElement>('play-sequence');
const sequenceLabel=$<HTMLElement>('sequence-state');
const sequenceStates=['SMILE','OO','AH','EE','SMILE'] as const;
let sequencePlaying=false,sequenceFrame=0,sequenceStart=0;
function stopSequence(){sequencePlaying=false;cancelAnimationFrame(sequenceFrame);sequenceButton.textContent='▶ Smile · OO · AH · EE · Smile';}
function renderSequenceState(index:number){
 const state=sequenceStates[index];
 sequenceLabel.textContent=state+' ('+(index+1)+'/5)';
 // Never composite a mouth onto a rendered expression in this audition.
 if(state==='SMILE'){
  calibrationPreview=false;speechPlaying=false;speechAmount=0;
  const smile=entries.find(([path])=>path.endsWith('/smile.json'))?.[0];
  if(smile&&select.value!==smile){select.value=smile;applyPreset();loadReference();}
  expressionBlend=1;render();return;
 }
 const name=state.toLowerCase() as SpeechViseme;
 const asset=visemeAssets.get(name);
 if(!asset?.image.complete||!asset.image.naturalWidth){
  sequenceLabel.textContent='Waiting for '+state+' photo';return;
 }
 // Full, unmodified photographed viseme face, with no expression layer beneath it.
 canvas.width=asset.image.naturalWidth;canvas.height=asset.image.naturalHeight;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(asset.image,0,0);
}
function sequenceTick(now:number){
 if(!sequencePlaying)return;
 const elapsed=now-sequenceStart;
 const stateDuration=150;
 const index=Math.min(4,Math.floor(elapsed/stateDuration));
 renderSequenceState(index);
 if(elapsed>=stateDuration*5){stopSequence();return;}
 sequenceFrame=requestAnimationFrame(sequenceTick);
}
sequenceButton.addEventListener('click',()=>{
 if(sequencePlaying){stopSequence();render();return;}
 stopAnimation();stopSpeech();auditionPlaying=false;auditionButton.textContent='▶ Play audition';
 ooStatic=false;ooButton.textContent='◉ Test static OO mouth';
 studioActive=false;calibrationPreview=false;
 canvas.style.display='block';
 sequencePlaying=true;sequenceStart=performance.now();
 sequenceButton.textContent='■ Stop sequential audition';
 sequenceFrame=requestAnimationFrame(sequenceTick);
});
