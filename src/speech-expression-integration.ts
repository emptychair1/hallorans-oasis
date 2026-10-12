import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace,paintFaceMesh,lipIndices} from './calibrated-expression-renderer';


const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLElement>('#status')!;
const smileButton=document.querySelector<HTMLButtonElement>('#smile')!;
const original=new Image();original.src=portraitUrl;
const smile=approvedExpressions.find(e=>e.filename==='smile.json');
const smileImage=new Image();if(smile)smileImage.src=smile.photoUrl;
const expressionCanvas=document.createElement('canvas');
const expressionCtx=expressionCanvas.getContext('2d')!;
type Shape='rest'|'mbp'|'ah'|'ee'|'oo'|'fv';
const maps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,{images:{role:string;landmarks:{x:number;y:number}[]}[]}>;
const visemeUrls=import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const visemeImages=new Map<Shape,HTMLImageElement>();
for(const name of ['mbp','ah','ee','oo','fv'] as Shape[]){
 const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
 const filename=(map?.images as {role:string;filename?:string}[]|undefined)?.find(i=>i.role==='expression-reference')?.filename;
 const url=filename&&Object.entries(visemeUrls).find(([path])=>path.endsWith('/'+filename))?.[1];
 if(url){const image=new Image();image.src=url;image.onload=draw;visemeImages.set(name,image);}
}
const mouthCanvas=document.createElement('canvas');
const mouthCtx=mouthCanvas.getContext('2d')!;
let smiling=true,smileMix=1,smileTarget=1,shape:Shape='rest',previous:Shape='rest',shapeMix=1,speaking=false,run=0,timer=0,animation=0,lastTick=0;
const ease=(dt:number,ms:number)=>1-Math.exp(-dt/ms);
function animate(now:number){
 const dt=lastTick?Math.min(64,now-lastTick):16;lastTick=now;
 smileMix+=(smileTarget-smileMix)*ease(dt,150);
 shapeMix+=(1-shapeMix)*ease(dt,85);
 draw();
 if(Math.abs(smileTarget-smileMix)>.005||shapeMix<.995)animation=requestAnimationFrame(animate);
 else{smileMix=smileTarget;shapeMix=1;animation=0;lastTick=0;draw();}
}
function refresh(){if(!animation)animation=requestAnimationFrame(animate);}
function setShape(next:Shape){if(next===shape)return;previous=shape;shape=next;shapeMix=0;refresh();}
function draw(){
 if(!original.complete||!original.naturalWidth)return;
 const w=original.naturalWidth,h=original.naturalHeight;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.clearRect(0,0,w,h);
 let points:{x:number;y:number}[]|undefined;
 if(smileMix>.001&&smile&&smileImage.complete&&smileImage.naturalWidth){
  const result=drawCalibratedFace(expressionCtx,original,smileImage,smile.map,smile.filename,smile.preset,smileMix);
  if(result){points=result.destination;ctx.drawImage(expressionCanvas,0,0,w,h);}
  else ctx.drawImage(original,0,0,w,h);
 }else ctx.drawImage(original,0,0,w,h);
 // Exact inner-lip contour, shared by the dark occluder and the viseme cutout.
 const innerUpper=[78,191,80,81,82,13,312,311,310,415,308];
 const innerLower=[308,324,318,402,317,14,87,178,88,95,78];
 function visemeGeometry(name:Shape){
  const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
  const ref=map?.images.find(i=>i.role==='expression-reference')?.landmarks;
  const locked=map?.images.find(i=>i.role==='locked-original')?.landmarks;
  if(!ref||!locked||ref.length!==478||locked.length!==478)return null;
  const base=locked.map((p,i)=>points?.[i]||{x:p.x*w,y:p.y*h});
  const center=base[13],corner=base[61];
  const mouthWidth=Math.max(1,Math.abs(base[291].x-corner.x));
  const dest=base.map((p,i)=>{
   const nx=(p.x-(corner.x+base[291].x)/2)/(mouthWidth*1.45);
   const ny=(p.y-center.y)/(mouthWidth*.95);
   const radius=Math.hypot(nx,ny);
   const weight=Math.max(0,Math.min(1,(1.35-radius)/.75));
   const falloff=weight*weight*(3-2*weight);
   return {x:p.x+(ref[i].x-locked[i].x)*w*falloff,
           y:p.y+(ref[i].y-locked[i].y)*h*falloff};
  });
  return {ref,base,dest};
 }
 function innerLipPath(c:CanvasRenderingContext2D,dest:{x:number;y:number}[]){
  c.beginPath();
  const first=dest[innerUpper[0]];c.moveTo(first.x,first.y);
  for(const i of innerUpper.slice(1))c.lineTo(dest[i].x,dest[i].y);
  for(const i of innerLower.slice(1))c.lineTo(dest[i].x,dest[i].y);
  c.closePath();
 }
 function hasOpening(dest:{x:number;y:number}[]){
  const width=Math.abs(dest[291].x-dest[61].x);
  return dest[14].y-dest[13].y>width*.025;
 }
 // Speech is a replacement texture, never a deformation of existing teeth.
 function replaceMouth(name:Shape,alpha:number){
  const image=visemeImages.get(name);
  const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
  if(!image?.naturalWidth||!map||alpha<=0)return;
  const geometry=visemeGeometry(name);
  if(!geometry)return;
  const {ref,base,dest}=geometry;
  const source=ref.map(p=>({x:p.x*image.naturalWidth,y:p.y*image.naturalHeight}));
  mouthCanvas.width=w;mouthCanvas.height=h;
  paintFaceMesh(image,source,dest,1,.5,mouthCtx);
  // Fill any uncovered mesh triangles with opaque original face pixels.
  // This fixes see-through patches without clearing the underlying face.
  mouthCtx.save();mouthCtx.globalCompositeOperation='destination-over';
  mouthCtx.drawImage(original,0,0,w,h);mouthCtx.restore();
  // Cover the old expression mouth as well as the displaced viseme mouth.
  const lips=[...lipIndices.map(i=>dest[i]),...lipIndices.map(i=>base[i])];
  const left=Math.min(...lips.map(p=>p.x)),right=Math.max(...lips.map(p=>p.x));
  const top=Math.min(...lips.map(p=>p.y)),bottom=Math.max(...lips.map(p=>p.y));
  const cx=(left+right)/2,cy=(top+bottom)/2;
  const rx=Math.max(2,(right-left)*.80),ry=Math.max(2,(bottom-top)*1.28,(right-left)*.29);
  mouthCtx.globalCompositeOperation='destination-in';
  mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx,ry);
  const fade=mouthCtx.createRadialGradient(0,0,.91,0,0,1);
  fade.addColorStop(0,'black');fade.addColorStop(.91,'black');fade.addColorStop(1,'transparent');
  mouthCtx.fillStyle=fade;mouthCtx.beginPath();mouthCtx.arc(0,0,1,0,Math.PI*2);mouthCtx.fill();
  mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
  // Remove only the inner-lip aperture from this OFFSCREEN viseme layer.
  // The opaque dark interior underneath remains visible through this exact opening.
  if(hasOpening(dest)){
   mouthCtx.save();mouthCtx.globalCompositeOperation='destination-out';
   innerLipPath(mouthCtx,dest);mouthCtx.fillStyle='#000';mouthCtx.fill();
   mouthCtx.restore();
  }
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(mouthCanvas,0,0);ctx.restore();
 }
 // Dark interior is between the previous expression and the new viseme layer.
 function darkenLipOpening(name:Shape,alpha:number){
  if(alpha<=0)return;
  const geometry=visemeGeometry(name);
  if(!geometry||!hasOpening(geometry.dest))return;
  ctx.save();
  ctx.globalAlpha=alpha;
  ctx.fillStyle='#170d13';
  innerLipPath(ctx,geometry.dest);
  ctx.fill();
  ctx.restore();
 }
 darkenLipOpening(previous,1-shapeMix);
 darkenLipOpening(shape,shapeMix);
 replaceMouth(previous,1-shapeMix);
 replaceMouth(shape,shapeMix);
 status.textContent=(smileMix>.5?'Smile':'Neutral')+' · '+(speaking?'speaking · ':'')+shape+' · REPLACEMENT TEST';
}
smileButton.onclick=()=>{smiling=!smiling;smileTarget=smiling?1:0;refresh();smileButton.textContent='Smile: '+(smiling?'ON':'OFF');};
function stop(){run++;clearInterval(timer);speechSynthesis.cancel();speaking=false;setShape('rest');draw();}
document.querySelector<HTMLButtonElement>('#stop')!.onclick=stop;
document.querySelector<HTMLButtonElement>('#speak')!.onclick=()=>{
 stop();const id=run;
 const utterance=new SpeechSynthesisUtterance('Baby, I am right here with you.');
 utterance.rate=.88;utterance.pitch=1.05;
 const sequence:Shape[]=['mbp','ah','ee','rest','ah','rest','ah','ee','rest','ee','oo','rest'];
 utterance.onstart=()=>{if(id!==run)return;speaking=true;let i=0;setShape(sequence[0]);timer=window.setInterval(()=>{if(id!==run){clearInterval(timer);return;}setShape(sequence[++i%sequence.length]);},160);};
 utterance.onend=()=>{if(id===run)stop();};
 utterance.onerror=()=>{if(id===run)stop();};
 speechSynthesis.speak(utterance);
};
original.onload=draw;smileImage.onload=draw;draw();
