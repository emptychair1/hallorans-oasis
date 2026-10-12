import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace} from './calibrated-expression-renderer';
import {warpExpressionAwareMouth,VISEME_AMOUNTS,shapeValue,type Viseme,type MouthCalibration} from './shared-viseme-engine';

const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLElement>('#status')!;
const smileButton=document.querySelector<HTMLButtonElement>('#smile')!;
const original=new Image();original.src=portraitUrl;
const smile=approvedExpressions.find(e=>e.filename==='smile.json');
const smileImage=new Image();if(smile)smileImage.src=smile.photoUrl;
const expressionCanvas=document.createElement('canvas');
const expressionCtx=expressionCanvas.getContext('2d')!;
type Shape=Viseme|'fv';
const maps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,{images:{role:string;landmarks:{x:number;y:number}[]}[]}>;
const neutral=Object.entries(maps).find(([path])=>path.endsWith('/ah.json'))?.[1]?.images.find(i=>i.role==='locked-original')?.landmarks;
let smiling=true,smileMix=1,smileTarget=1,shape:Shape='rest',previous:Shape='rest',shapeMix=1,speaking=false,run=0,timer=0,animation=0,lastTick=0;
const ease=(dt:number,ms:number)=>1-Math.exp(-dt/ms);
const amount=(name:Shape)=>name==='fv'?.12:VISEME_AMOUNTS[name];
const horizontal=(name:Shape)=>name==='fv'?-.06:shapeValue(name);
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
 // The face already contains exactly one mouth. Deform those pixels in place.
 // No second photographic mouth, overlay canvas, or replacement mask is rendered.
 const blend=(a:number,b:number)=>a+(b-a)*shapeMix;
 const opening=blend(amount(previous),amount(shape));
 const spread=blend(horizontal(previous),horizontal(shape));
 const closure=blend(previous==='mbp'?1:0,shape==='mbp'?1:0);
 const p=(index:number)=>points?.[index]||neutral&&{x:neutral[index].x*w,y:neutral[index].y*h};
 const a=p(61),b=p(291),upper=p(13),lower=p(14),center=p(17);
 if(a&&b&&upper&&lower&&center&&(opening>.001||Math.abs(spread)>.001||closure>.001)){
  const calibration:MouthCalibration={
   leftCorner:{x:a.x/w,y:a.y/h},rightCorner:{x:b.x/w,y:b.y/h},
   upperInner:{x:upper.x/w,y:upper.y/h},lowerInner:{x:lower.x/w,y:lower.y/h},
   lowerCenter:{x:center.x/w,y:center.y/h}
  };
  warpExpressionAwareMouth(ctx,w,h,calibration,opening,spread,closure);
 }
 status.textContent=(smileMix>.5?'Smile':'Neutral')+' · '+(speaking?'speaking · ':'')+shape+' · LANDMARK DYNAMIC';
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
