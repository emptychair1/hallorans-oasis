import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace,lipIndices} from './calibrated-expression-renderer';
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLElement>('#status')!;
const original=new Image();original.src=portraitUrl;
const smile=approvedExpressions.find(e=>e.filename==='smile.json');
const smileImage=new Image();if(smile)smileImage.src=smile.photoUrl;
const expressionCanvas=document.createElement('canvas');
const expressionCtx=expressionCanvas.getContext('2d')!;
const maps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,{images:{role:string;filename:string;landmarks:{x:number;y:number}[]}[]}>;
const urls=import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
type Shape='rest'|'mbp'|'ah'|'ee'|'oo'|'fv';
const images=new Map<Shape,HTMLImageElement>();
const visemeMaps=new Map<Shape,{images:{role:string;filename:string;landmarks:{x:number;y:number}[]}[]}>();
for(const name of ['mbp','ah','ee','oo','fv'] as Shape[]){
 const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
 const file=map?.images.find(i=>i.role==='expression-reference')?.filename;
 const url=Object.entries(urls).find(([path])=>path.endsWith('/'+file))?.[1];
 if(url&&map){visemeMaps.set(name,map);const image=new Image();image.src=url;image.onload=draw;images.set(name,image);}
}
const layer=document.createElement('canvas');
const layerCtx=layer.getContext('2d')!;
let smiling=true,shape:Shape='rest',speaking=false,run=0,timer=0;
let smileMix=1,smileTarget=1,shapeMix=0,transitionFrom:Shape='rest',animation=0,lastTick=0;
const ease=(dt:number,ms:number)=>1-Math.exp(-dt/ms);
function animate(now:number){const dt=lastTick?Math.min(64,now-lastTick):16;lastTick=now;smileMix+=(smileTarget-smileMix)*ease(dt,150);shapeMix+=(1-shapeMix)*ease(dt,85);draw();if(Math.abs(smileTarget-smileMix)>.005||shapeMix<.995)animation=requestAnimationFrame(animate);else{smileMix=smileTarget;shapeMix=1;animation=0;lastTick=0;draw();}}
function refresh(){if(!animation)animation=requestAnimationFrame(animate);}
function setShape(next:Shape){if(next===shape)return;transitionFrom=shape;shape=next;shapeMix=0;refresh();}
function draw(){
 if(!original.complete||!original.naturalWidth)return;
 const w=original.naturalWidth,h=original.naturalHeight;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.clearRect(0,0,w,h);
 if(smiling&&smile&&smileImage.complete&&smileImage.naturalWidth){
  const result=drawCalibratedFace(expressionCtx,original,smileImage,smile.map,smile.filename,smile.preset,smileMix);
  if(result)ctx.drawImage(expressionCanvas,0,0,w,h);else ctx.drawImage(original,0,0,w,h);
 }else ctx.drawImage(original,0,0,w,h);
 // Composite the mouth in the landmark coordinate system, not a fixed ellipse.
 // Crossfade the two viseme states while preserving the current expression geometry.
 function paintShape(name:Shape,opacity:number){
  const image=images.get(name),map=visemeMaps.get(name);
  if(name==='rest'||!image?.complete||!image.naturalWidth||!map||opacity<=0)return;
  const ref=map.images.find(i=>i.role==='expression-reference')?.landmarks;
  const src=map.images.find(i=>i.role==='locked-original')?.landmarks;
  const smileDest=smile?.map.images.find(i=>i.role==='expression-reference')?.landmarks;
  const smileSrc=smile?.map.images.find(i=>i.role==='locked-original')?.landmarks;
  if(!ref||!src||ref.length!==478||src.length!==478)return;
  const bounds=(pts:{x:number;y:number}[])=>{
   const lip=lipIndices.map(i=>pts[i]);
   return {cx:(Math.min(...lip.map(p=>p.x))+Math.max(...lip.map(p=>p.x)))/2,
    cy:(Math.min(...lip.map(p=>p.y))+Math.max(...lip.map(p=>p.y)))/2,
    width:Math.max(...lip.map(p=>p.x))-Math.min(...lip.map(p=>p.x)),
    height:Math.max(...lip.map(p=>p.y))-Math.min(...lip.map(p=>p.y))};
  };
  const source=bounds(ref),neutral=bounds(src);
  const smileBounds=smileDest&&smileSrc?bounds(smileDest):neutral;
  const smileBase=smileSrc?bounds(smileSrc):neutral;
  // Preserve the smile's mouth corner spread and vertical placement.
  const dest={cx:neutral.cx+(smileBounds.cx-smileBase.cx)*smileMix,
   cy:neutral.cy+(smileBounds.cy-smileBase.cy)*smileMix,
   width:neutral.width+(smileBounds.width-smileBase.width)*smileMix,
   height:neutral.height+(smileBounds.height-smileBase.height)*smileMix};
  const sx=dest.width/Math.max(.001,source.width),sy=dest.height/Math.max(.001,source.height);
  layer.width=w;layer.height=h;
  layerCtx.save();layerCtx.translate(dest.cx*w,dest.cy*h);layerCtx.scale(sx,sy);
  layerCtx.translate(-source.cx*w,-source.cy*h);layerCtx.drawImage(image,0,0,w,h);layerCtx.restore();
  layerCtx.globalCompositeOperation='destination-in';
  layerCtx.save();layerCtx.translate(dest.cx*w,dest.cy*h);
  const rx=Math.max(1,dest.width*w*.76),ry=Math.max(1,dest.height*h*1.08);
  layerCtx.scale(rx,ry);
  const fade=layerCtx.createRadialGradient(0,0,.65,0,0,1);
  fade.addColorStop(0,'black');fade.addColorStop(1,'transparent');
  layerCtx.fillStyle=fade;layerCtx.beginPath();layerCtx.arc(0,0,1,0,Math.PI*2);layerCtx.fill();
  layerCtx.restore();layerCtx.globalCompositeOperation='source-over';
  ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity));ctx.drawImage(layer,0,0);ctx.restore();
 }
 paintShape(transitionFrom,1-shapeMix);
 paintShape(shape,shapeMix);
 status.textContent=(smileMix>.5?'Smile':'Neutral')+' · '+(speaking?'speaking · ':'')+shape;
}
const smileButton=document.querySelector<HTMLButtonElement>('#smile')!;
smileButton.onclick=()=>{smiling=!smiling;smileTarget=smiling?1:0;refresh();smileButton.textContent='Smile: '+(smiling?'ON':'OFF');draw();};
function stop(){run++;clearInterval(timer);speechSynthesis.cancel();speaking=false;setShape('rest');draw();}
document.querySelector<HTMLButtonElement>('#stop')!.onclick=stop;
document.querySelector<HTMLButtonElement>('#speak')!.onclick=()=>{
 stop();const id=run;
 const utterance=new SpeechSynthesisUtterance('Baby, I am right here with you.');
 utterance.rate=.88;utterance.pitch=1.05;
 const sequence:Shape[]=['mbp','ah','ee','rest','ah','rest','ah','ee','rest','ee','oo','rest'];
 utterance.onstart=()=>{if(id!==run)return;speaking=true;let i=0;setShape(sequence[0]);draw();timer=window.setInterval(()=>{if(id!==run){clearInterval(timer);return;}setShape(sequence[++i%sequence.length]);draw();},160);};
 utterance.onend=()=>{if(id===run)stop();};
 utterance.onerror=()=>{if(id===run)stop();};
 speechSynthesis.speak(utterance);
};
original.onload=draw;smileImage.onload=draw;draw();
