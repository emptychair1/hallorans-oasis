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
const replacementCanvas=document.createElement('canvas');
const replacementCtx=replacementCanvas.getContext('2d')!;
const coverageCanvas=document.createElement('canvas');
const coverageCtx=coverageCanvas.getContext('2d')!;
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
 // Speech is a replacement texture, never a deformation of existing teeth.
 function replaceMouth(name:Shape,alpha:number){
  const image=visemeImages.get(name);
  const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
  if(!image?.naturalWidth||!map||alpha<=0)return;
  const ref=map.images.find(i=>i.role==='expression-reference')?.landmarks;
  const locked=map.images.find(i=>i.role==='locked-original')?.landmarks;
  if(!ref||!locked||ref.length!==478||locked.length!==478)return;
  const source=ref.map(p=>({x:p.x*image.naturalWidth,y:p.y*image.naturalHeight}));
  const base=locked.map((p,i)=>points?.[i]||{x:p.x*w,y:p.y*h});
  const cx=(base[61].x+base[291].x)/2;
  const cy=(base[13].y+base[14].y)/2;
  const mouthWidth=Math.max(1,Math.abs(base[291].x-base[61].x));
  const dest=base.map((p,i)=>{
   const radius=Math.hypot((p.x-cx)/(mouthWidth*1.3),(p.y-cy)/(mouthWidth*.85));
   const t=Math.max(0,1-radius);
   const influence=t*t*(3-2*t);
   return {x:p.x+(ref[i].x-locked[i].x)*w*.65*influence,y:p.y+(ref[i].y-locked[i].y)*h*.65*influence};
  });
  mouthCanvas.width=w;mouthCanvas.height=h;
  paintFaceMesh(image,source,dest,1,.5,mouthCtx);
  const lips=lipIndices.map(i=>dest[i]);
  const left=Math.min(...lips.map(p=>p.x)),right=Math.max(...lips.map(p=>p.x));
  const top=Math.min(...lips.map(p=>p.y)),bottom=Math.max(...lips.map(p=>p.y));
  const maskCx=(left+right)/2,maskCy=(top+bottom)/2;
  const rx=Math.max(2,(right-left)*1.08),ry=Math.max(2,(bottom-top)*2.0,(right-left)*.46);
  mouthCtx.globalCompositeOperation='destination-in';
  mouthCtx.save();mouthCtx.translate(maskCx,maskCy);mouthCtx.scale(rx,ry);
  const fade=mouthCtx.createRadialGradient(0,0,.94,0,0,1);
  fade.addColorStop(0,'black');fade.addColorStop(.94,'black');fade.addColorStop(1,'transparent');
  mouthCtx.fillStyle=fade;mouthCtx.beginPath();mouthCtx.arc(0,0,1,0,Math.PI*2);mouthCtx.fill();
  mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
  replacementCtx.save();replacementCtx.globalAlpha=alpha;replacementCtx.drawImage(mouthCanvas,0,0);replacementCtx.restore();
 }
 replacementCanvas.width=w;replacementCanvas.height=h;
 replaceMouth(previous,1-shapeMix);
 replaceMouth(shape,shapeMix);
 // Remove the original smile/lip pixels under the replacement, instead
 // of leaving them visible through the viseme texture.
 if(visemeImages.has(shape)||visemeImages.has(previous)){
  coverageCanvas.width=w;coverageCanvas.height=h;
  coverageCtx.drawImage(replacementCanvas,0,0);
  coverageCtx.globalCompositeOperation='source-in';
  coverageCtx.fillStyle='#000';
  coverageCtx.fillRect(0,0,w,h);
  coverageCtx.globalCompositeOperation='source-over';
  ctx.save();ctx.globalCompositeOperation='destination-out';
  ctx.drawImage(coverageCanvas,0,0);ctx.restore();
 }
 ctx.drawImage(replacementCanvas,0,0);
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
