import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace} from './calibrated-expression-renderer';
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLElement>('#status')!;
const original=new Image();original.src=portraitUrl;
const smile=approvedExpressions.find(e=>e.filename==='smile.json');
const smileImage=new Image();if(smile)smileImage.src=smile.photoUrl;
const expressionCanvas=document.createElement('canvas');
const expressionCtx=expressionCanvas.getContext('2d')!;
const maps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,{images:{role:string;filename:string}[]}>;
const urls=import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
type Shape='rest'|'mbp'|'ah'|'ee'|'oo'|'fv';
const images=new Map<Shape,HTMLImageElement>();
for(const name of ['mbp','ah','ee','oo','fv'] as Shape[]){
 const map=Object.entries(maps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
 const file=map?.images.find(i=>i.role==='expression-reference')?.filename;
 const url=Object.entries(urls).find(([path])=>path.endsWith('/'+file))?.[1];
 if(url){const image=new Image();image.src=url;image.onload=draw;images.set(name,image);}
}
const layer=document.createElement('canvas');
const layerCtx=layer.getContext('2d')!;
let smiling=true,shape:Shape='rest',speaking=false,run=0,timer=0;
function draw(){
 if(!original.complete||!original.naturalWidth)return;
 const w=original.naturalWidth,h=original.naturalHeight;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.clearRect(0,0,w,h);
 if(smiling&&smile&&smileImage.complete&&smileImage.naturalWidth){
  const result=drawCalibratedFace(expressionCtx,original,smileImage,smile.map,smile.filename,smile.preset);
  if(result)ctx.drawImage(expressionCanvas,0,0,w,h);else ctx.drawImage(original,0,0,w,h);
 }else ctx.drawImage(original,0,0,w,h);
 const image=images.get(shape);
 if(shape!=='rest'&&image?.complete&&image.naturalWidth){
  layer.width=w;layer.height=h;layerCtx.drawImage(image,0,0,w,h);
  layerCtx.globalCompositeOperation='destination-in';
  layerCtx.save();layerCtx.translate(w*.495,h*.715);layerCtx.scale(w*.125,h*.095);
  const fade=layerCtx.createRadialGradient(0,0,.52,0,0,1);
  fade.addColorStop(0,'black');fade.addColorStop(1,'transparent');
  layerCtx.fillStyle=fade;layerCtx.beginPath();layerCtx.arc(0,0,1,0,Math.PI*2);layerCtx.fill();
  layerCtx.restore();layerCtx.globalCompositeOperation='source-over';
  ctx.drawImage(layer,0,0);
 }
 status.textContent=(smiling?'Smile':'Neutral')+' · '+(speaking?'speaking · ':'')+shape;
}
const smileButton=document.querySelector<HTMLButtonElement>('#smile')!;
smileButton.onclick=()=>{smiling=!smiling;smileButton.textContent='Smile: '+(smiling?'ON':'OFF');draw();};
function stop(){run++;clearInterval(timer);speechSynthesis.cancel();speaking=false;shape='rest';draw();}
document.querySelector<HTMLButtonElement>('#stop')!.onclick=stop;
document.querySelector<HTMLButtonElement>('#speak')!.onclick=()=>{
 stop();const id=run;
 const utterance=new SpeechSynthesisUtterance('Baby, I am right here with you.');
 utterance.rate=.88;utterance.pitch=1.05;
 const sequence:Shape[]=['mbp','ah','ee','rest','ah','rest','ah','ee','rest','ee','oo','rest'];
 utterance.onstart=()=>{if(id!==run)return;speaking=true;let i=0;shape=sequence[0];draw();timer=window.setInterval(()=>{if(id!==run){clearInterval(timer);return;}shape=sequence[++i%sequence.length];draw();},160);};
 utterance.onend=()=>{if(id===run)stop();};
 utterance.onerror=()=>{if(id===run)stop();};
 speechSynthesis.speak(utterance);
};
original.onload=draw;smileImage.onload=draw;draw();
