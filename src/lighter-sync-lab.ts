import { LighterSync } from 'lighter-sync';
import portraitUrl from '../IMG_4604.jpeg?url';
type PhotoMap={images:{role:string;filename:string}[]};
const maps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,PhotoMap>;
const urls=import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const photos:Record<string,string>={rest:portraitUrl};
for(const shape of ['mbp','ah','ee','oo','fv']){
 const map=Object.entries(maps).find(([p])=>p.endsWith('/'+shape+'.json'))?.[1];
 const file=map?.images.find(i=>i.role==='expression-reference')?.filename;
 const url=Object.entries(urls).find(([p])=>p.endsWith('/'+file))?.[1];
 if(url)photos[shape]=url;
}
const file=document.querySelector<HTMLInputElement>('#file')!;
const script=document.querySelector<HTMLTextAreaElement>('#script')!;
const run=document.querySelector<HTMLButtonElement>('#run')!;
const state=document.querySelector<HTMLElement>('#state')!;
const mouth=document.querySelector<HTMLImageElement>('#mouth')!;
let context:AudioContext|undefined;
let source:AudioBufferSourceNode|undefined;
let raf=0;
run.onclick=async()=>{
 run.disabled=true;
 cancelAnimationFrame(raf);
 try{
  source?.stop();
  if(context)await context.close();
  if(!file.files?.[0]||!script.value.trim())throw Error('Choose an audio file and enter its spoken text.');
  state.textContent='Decoding audio…';
  context=new AudioContext();
  await context.resume();
  const audio=await context.decodeAudioData(await file.files[0].arrayBuffer());
  state.textContent='Aligning phonemes…';
  const sync=new LighterSync({mode:'simple'});
  await sync.prepare(audio,script.value.trim());
  const cues=sync.keyframes.length;
  if(!cues)throw Error('No mouth cues generated.');
  source=context.createBufferSource();
  source.buffer=audio;
  source.connect(context.destination);
  const started=context.currentTime;
  let last='',lastAt=0;
  const tick=()=>{
   if(!context)return;
   const t=context.currentTime-started;
   const frame=sync.getFrame(Math.min(t,audio.duration));
   const category=frame.visemeId;
   const shape=category==='SILENT'?'rest':category==='CLOSED'?'mbp':category==='FRICATIVE'?'fv':category==='ROUND'?'oo':category==='OPEN'?(frame.width>.75?'ah':'ee'):'ee';
   if(shape!==last&&(shape==='rest'||t-lastAt>.085)){
    last=shape;lastAt=t;mouth.src=photos[shape]||portraitUrl;
   }
   state.textContent='Playing · '+t.toFixed(2)+'s / '+audio.duration.toFixed(2)+'s · '+category+' → '+shape+' · '+cues+' cues';
   if(t<audio.duration)raf=requestAnimationFrame(tick);
   else{mouth.src=portraitUrl;run.disabled=false;state.textContent='Finished · '+cues+' cues';}
  };
  source.start();
  tick();
 }catch(e){state.textContent='Error: '+String(e);run.disabled=false;}
};
