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
const mouthMaskCanvas=document.createElement('canvas');
const mouthMaskCtx=mouthMaskCanvas.getContext('2d')!;
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
 function replaceMouth(name:Shape,alpha:number,overrideDest?:{x:number;y:number}[]){
  const image=visemeImages.get(name);
  const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
  if(!image?.naturalWidth||!map||alpha<=0)return;
  const geometry=visemeGeometry(name);
  if(!geometry)return;
  const {ref,base}=geometry;
  const dest=overrideDest||geometry.dest;
  const source=ref.map(p=>({x:p.x*image.naturalWidth,y:p.y*image.naturalHeight}));
  mouthCanvas.width=w;mouthCanvas.height=h;
  paintFaceMesh(image,source,dest,1,.5,mouthCtx);
  // Fill uncovered mesh triangles from the SAME viseme photograph.
  // Using the original portrait here reintroduced its stationary lip contours
  // beneath the warped replacement, producing a doubled upper lip.
  mouthCtx.save();mouthCtx.globalCompositeOperation='destination-over';
  mouthCtx.drawImage(image,0,0,w,h);mouthCtx.restore();
  // Cover the old expression mouth as well as the displaced viseme mouth.
  const lips=[...lipIndices.map(i=>dest[i]),...lipIndices.map(i=>base[i])];
  const left=Math.min(...lips.map(p=>p.x)),right=Math.max(...lips.map(p=>p.x));
  const top=Math.min(...lips.map(p=>p.y)),bottom=Math.max(...lips.map(p=>p.y));
  // Follow the lip envelope rather than a broad oval. The old oval reached
  // into the philtrum and chin, revealing a mismatched photographic skin patch.
  // A narrow, feathered capsule keeps both old and displaced lip outlines inside
  // its solid center, while fading out before reaching unrelated facial skin.
  const width=right-left,height=bottom-top;
  const padX=Math.max(8,width*.10),padY=Math.max(6,height*.19);
  const x0=left-padX,x1=right+padX,y0=top-padY,y1=bottom+padY;
  const feather=Math.max(5,Math.min(14,width*.045));
  if(mouthMaskCanvas.width!==w||mouthMaskCanvas.height!==h){mouthMaskCanvas.width=w;mouthMaskCanvas.height=h;}
  mouthMaskCtx.clearRect(0,0,w,h);
  const mc=mouthMaskCtx;
  mc.save();
  mc.filter='blur('+feather+'px)';
  mc.fillStyle='#fff';
  mc.beginPath();
  const radius=Math.min((y1-y0)*.48,(x1-x0)*.22);
  mc.moveTo(x0+radius,y0);
  mc.lineTo(x1-radius,y0);
  mc.quadraticCurveTo(x1,y0,x1,y0+radius);
  mc.lineTo(x1,y1-radius);
  mc.quadraticCurveTo(x1,y1,x1-radius,y1);
  mc.lineTo(x0+radius,y1);
  mc.quadraticCurveTo(x0,y1,x0,y1-radius);
  mc.lineTo(x0,y0+radius);
  mc.quadraticCurveTo(x0,y0,x0+radius,y0);
  mc.closePath();mc.fill();mc.restore();
  mouthCtx.save();mouthCtx.globalCompositeOperation='destination-in';
  mouthCtx.drawImage(mouthMaskCanvas,0,0);mouthCtx.restore();
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
 // Use the existing AH photographic mouth interior, aligned to the
 // current lip landmarks and clipped to their exact inner contour.
 function compositeMouthInterior(name:Shape,alpha:number,overrideDest?:{x:number;y:number}[]){
  if(alpha<=0)return;
  const geometry=visemeGeometry(name);
  const ah=visemeImages.get('ah');
  const ahMap=Object.entries(maps).find(([path])=>path.endsWith('/ah.json'))?.[1];
  const ahRef=ahMap?.images.find(i=>i.role==='expression-reference')?.landmarks;
  if(!geometry||!hasOpening(overrideDest||geometry.dest)||!ah?.naturalWidth||!ahRef)return;
  const dest=overrideDest||geometry.dest;
  const src=ahRef.map(p=>({x:p.x*ah.naturalWidth,y:p.y*ah.naturalHeight}));
  // Align the AH image to the moving mouth using inner lip corners and
  // upper/lower midpoints; leave expression and speech geometry unchanged.
  const sourceCenter={x:(src[78].x+src[308].x)/2,y:(src[13].y+src[14].y)/2};
  const targetCenter={x:(dest[78].x+dest[308].x)/2,y:(dest[13].y+dest[14].y)/2};
  const sourceWidth=Math.max(1,Math.abs(src[308].x-src[78].x));
  const targetWidth=Math.max(1,Math.abs(dest[308].x-dest[78].x));
  const sourceGap=Math.max(1,Math.abs(src[14].y-src[13].y));
  const targetGap=Math.max(1,Math.abs(dest[14].y-dest[13].y));
  ctx.save();
  innerLipPath(ctx,dest);ctx.clip();
  ctx.globalAlpha=alpha;
  ctx.translate(targetCenter.x,targetCenter.y);
  ctx.scale(targetWidth/sourceWidth,targetGap/sourceGap);
  ctx.translate(-sourceCenter.x,-sourceCenter.y);
  ctx.drawImage(ah,0,0);
  ctx.restore();
 }
 // One moving mouth surface during transitions: interpolate its geometry rather
 // than overlaying two independent lip textures (which produces ghost contours).
 const incoming=visemeGeometry(shape);
 const outgoing=visemeGeometry(previous);
 const activeImage=visemeImages.get(shape);
 const outgoingImage=visemeImages.get(previous);
 if(incoming&&activeImage?.naturalWidth){
  const dest=outgoing&&shapeMix<1
   ? incoming.dest.map((p,i)=>({x:outgoing.dest[i].x*(1-shapeMix)+p.x*shapeMix,
                               y:outgoing.dest[i].y*(1-shapeMix)+p.y*shapeMix}))
   : incoming.dest;
  const opacity=previous==='rest'?shapeMix:1;
  compositeMouthInterior(shape,opacity,dest);
  replaceMouth(shape,opacity,dest);
 }else if(outgoing&&outgoingImage?.naturalWidth&&shapeMix<1){
  compositeMouthInterior(previous,1-shapeMix);
  replaceMouth(previous,1-shapeMix);
 }
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
