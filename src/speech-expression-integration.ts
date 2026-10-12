import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace,paintFaceMesh,lipIndices} from './calibrated-expression-renderer';
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
 let expressionDestination:{x:number;y:number}[]|undefined;
 if(smileMix>.001&&smile&&smileImage.complete&&smileImage.naturalWidth){
  const result=drawCalibratedFace(expressionCtx,original,smileImage,smile.map,smile.filename,smile.preset,smileMix,shape!=='rest'||(transitionFrom!=='rest'&&shapeMix<.999));
  if(result){expressionDestination=result.destination;ctx.drawImage(expressionCanvas,0,0,w,h);}else ctx.drawImage(original,0,0,w,h);
 }else ctx.drawImage(original,0,0,w,h);
 // Build one destination landmark field for expression and speech.
 // Mouth-corner displacement is damped so the smile survives articulation.
 function paintShape(name:Shape,opacity:number){
  const image=images.get(name),map=visemeMaps.get(name);
  if(name==='rest'||!image?.complete||!image.naturalWidth||!map||opacity<=0)return;
  const ref=map.images.find(i=>i.role==='expression-reference')?.landmarks;
  const neutral=map.images.find(i=>i.role==='locked-original')?.landmarks;
  if(!ref||!neutral||ref.length!==478||neutral.length!==478)return;
  const source=ref.map(p=>({x:p.x*image.naturalWidth,y:p.y*image.naturalHeight}));
  const base=neutral.map((p,i)=>expressionDestination?.[i]||{x:p.x*w,y:p.y*h});
  const mouth=lipIndices.map(i=>base[i]);
  const left=Math.min(...mouth.map(p=>p.x)),right=Math.max(...mouth.map(p=>p.x));
  const top=Math.min(...mouth.map(p=>p.y)),bottom=Math.max(...mouth.map(p=>p.y));
  const cx=(left+right)/2,cy=(top+bottom)/2;
  const width=Math.max(1,right-left),height=Math.max(1,bottom-top);
  const shapeStrength=name==='ah'?.85:name==='oo'?.8:name==='ee'?.75:1;
  const destination=base.map((p,i)=>{
   const q=ref[i],n=neutral[i];
   const nx=(p.x-cx)/(width*1.65),ny=(p.y-cy)/(height*2.2);
   const distance=nx*nx+ny*ny;
   const influence=Math.pow(Math.max(0,1-distance),2);
   // Attenuate speech deformation at the corners to retain the smile.
   const cornerFactor=Math.max(.35,1-Math.pow(Math.min(1,Math.abs((p.x-cx)/(width*.5))),4)*.65*smileMix);
   return {x:p.x+(q.x-n.x)*w*influence*cornerFactor*shapeStrength,
           y:p.y+(q.y-n.y)*h*influence*shapeStrength};
  });
  layer.width=w;layer.height=h;
  paintFaceMesh(image,source,destination,1,.4,layerCtx);
  // Mask tracks the final destination lips, not an image-space oval.
  const lips=lipIndices.map(i=>destination[i]);
  const minX=Math.min(...lips.map(p=>p.x)),maxX=Math.max(...lips.map(p=>p.x));
  const minY=Math.min(...lips.map(p=>p.y)),maxY=Math.max(...lips.map(p=>p.y));
  const mx=(minX+maxX)/2,my=(minY+maxY)/2;
  const rx=Math.max(2,(maxX-minX)*.9),ry=Math.max(2,(maxY-minY)*1.4);
  layerCtx.globalCompositeOperation='destination-in';
  layerCtx.save();layerCtx.translate(mx,my);layerCtx.scale(rx,ry);
  const mask=layerCtx.createRadialGradient(0,0,.82,0,0,1);
  mask.addColorStop(0,'#000');mask.addColorStop(1,'transparent');
  layerCtx.fillStyle=mask;layerCtx.beginPath();layerCtx.arc(0,0,1,0,Math.PI*2);layerCtx.fill();
  layerCtx.restore();layerCtx.globalCompositeOperation='source-over';
  ctx.save();ctx.globalAlpha=Math.min(1,Math.max(0,opacity));ctx.drawImage(layer,0,0);ctx.restore();
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
