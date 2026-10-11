import { warpCalibratedMouth, VISEME_AMOUNTS, shapeValue } from './shared-viseme-engine';
import portraitUrl from '../IMG_4604.jpeg?url';
type PhotoViseme='oo'|'mbp'|'ah'|'ee'|'fv';
type VisemePhotoMap={images:{role:string;filename:string}[]};
const photoMaps=import.meta.glob('../assets/visemes/*.json',{eager:true,import:'default'}) as Record<string,VisemePhotoMap>;
const photoUrls=import.meta.glob('../assets/visemes/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const speechPhotos=new Map<PhotoViseme,HTMLImageElement>();
for(const name of ['oo','mbp','ah','ee','fv'] as const){
 const map=Object.entries(photoMaps).find(([path])=>path.endsWith('/'+name+'.json'))?.[1];
 const filename=map?.images.find(image=>image.role==='expression-reference')?.filename;
 const url=Object.entries(photoUrls).find(([path])=>path.endsWith('/'+filename))?.[1];
 if(!url)continue;
 const img=new Image();img.src=url;speechPhotos.set(name,img);
}

type Point = {x:number;y:number};
type Key = 'leftCorner'|'rightCorner'|'upperCenter'|'lowerCenter'|'cupidLeft'|'cupidRight'|'lowerLeft'|'lowerRight'|'upperInner'|'lowerInner'|'upperInnerLeft'|'upperInnerRight'|'lowerInnerLeft'|'lowerInnerRight';
const keys:Key[]=['leftCorner','cupidLeft','upperCenter','cupidRight','rightCorner','lowerRight','lowerCenter','lowerLeft','upperInner','lowerInner','upperInnerLeft','upperInnerRight','lowerInnerLeft','lowerInnerRight'];
// Calibrated by Josh on the original IMG_4604.jpeg; do not overwrite with estimates.
const defaults = {"leftCorner":{"x":0.39844241801513464,"y":0.7019215105734092},"cupidLeft":{"x":0.4549139150630831,"y":0.6668338004823194},"upperCenter":{"x":0.48132795312831317,"y":0.680684215122528},"cupidRight":{"x":0.5101101966709075,"y":0.6668337480015316},"rightCorner":{"x":0.5924492626497562,"y":0.7009981635922722},"lowerRight":{"x":0.5505510868916985,"y":0.7499362883235705},"lowerCenter":{"x":0.4877037714860316,"y":0.7674801433691154},"lowerLeft":{"x":0.4184806894912267,"y":0.7407026610698355},"upperInner":{"x":0.47404131836765795,"y":0.7019215105734092},"lowerInner":{"x":0.5031879091788591,"y":0.7093083913840821},"upperInnerLeft":{"x":0.4461699429965808,"y":0.6995207244531921},"upperInnerRight":{"x":0.5226796597520409,"y":0.6967506310289929},"lowerInnerLeft":{"x":0.48588213868015795,"y":0.7157719252136178},"lowerInnerRight":{"x":0.5204936796775604,"y":0.7120784848082814}} as Record<Key,Point>;
const svg=document.querySelector<SVGSVGElement>('#overlay')!;
const output=document.querySelector<HTMLElement>('#output')!;
const storeKey='piper-viseme-lab-12-corrected-calibration';
let points:Record<Key,Point>=structuredClone(defaults);
try{const saved=JSON.parse(localStorage.getItem(storeKey)||'null');if(saved&&keys.every(k=>Number.isFinite(saved[k]?.x)&&Number.isFinite(saved[k]?.y)))points=saved;}catch{/* ignore */}
let zoom=1,active:Key|null=null,w=1000,h=1000;
let showMarkers=false,opening=0;
type Viseme='rest'|'ah'|'ee'|'oo'|'mbp';
let viseme:Viseme='rest';
let targetOpening=0,shapeBlend=0,targetShape=0,mbpBlend=0,targetMbp=0;
let animationFrame=0,lastFrame=0;

function animateMouth(now:number){
 const dt=lastFrame?Math.min(64,now-lastFrame):16;lastFrame=now;
 const alpha=1-Math.exp(-dt/95);
 opening+=(targetOpening-opening)*alpha;
 shapeBlend+=(targetShape-shapeBlend)*alpha;
 mbpBlend+=(targetMbp-mbpBlend)*alpha;
 if(Math.abs(opening-targetOpening)<.0005)opening=targetOpening;
 if(Math.abs(shapeBlend-targetShape)<.0005)shapeBlend=targetShape;
 if(Math.abs(mbpBlend-targetMbp)<.0005)mbpBlend=targetMbp;
 draw();
 if(opening!==targetOpening||shapeBlend!==targetShape||mbpBlend!==targetMbp)animationFrame=requestAnimationFrame(animateMouth);
 else{animationFrame=0;lastFrame=0;}
}
function aimMouth(v:Viseme,amount:number){
 viseme=v;targetOpening=amount;targetShape=shapeValue(v);targetMbp=v==='mbp'?1:0;
 if(!animationFrame)animationFrame=requestAnimationFrame(animateMouth);
}
const ns='http://www.w3.org/2000/svg';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const element=(name:string)=>document.createElementNS(ns,name);
const photo=document.querySelector<HTMLImageElement>('#portrait')!;
const warp=document.querySelector<HTMLCanvasElement>('#warp')!;
const warpCtx=warp.getContext('2d',{willReadFrequently:true});
photo.src=portraitUrl;
function draw(){
 const side=Math.min(w,h)/zoom, cx=.5*w,cy=(zoom===1?.5:.707)*h;
 svg.setAttribute('viewBox',`${cx-side/2} ${cy-side/2} ${side} ${side}`);
 svg.replaceChildren();
 // Keep the portrait in HTML instead of an SVG <image>, which can fail on mobile.
 const stage=svg.parentElement!;
 const pixels=stage.clientWidth/side;
 photo.style.width=(w*pixels)+'px';
 photo.style.height=(h*pixels)+'px';
 photo.style.left=(-(cx-side/2)*pixels)+'px';
 photo.style.top=(-(cy-side/2)*pixels)+'px';
 // Bite 06: resample the full frame, never paste a second translated lip.
 // Smooth displacement returns to zero at the corners, cheeks, and chin.
 if(warpCtx && photo.complete && photo.naturalWidth){
  const size=Math.max(1,Math.round(stage.clientWidth));
  if(warp.width!==size||warp.height!==size){warp.width=size;warp.height=size;}
  const scale=size/side;
  warpCtx.setTransform(scale,0,0,scale,-(cx-side/2)*scale,-(cy-side/2)*scale);
  warpCtx.clearRect(0,0,w,h);
  warpCtx.drawImage(photo,0,0,w,h);
  warpCtx.setTransform(1,0,0,1,0,0);
  if(opening>.0001||mbpBlend>.0001||Math.abs(shapeBlend)>.0001){
   warpCalibratedMouth(warpCtx,size,size,w,h,points,opening,shapeBlend,mbpBlend,cx-side/2,cy-side/2,scale);
  }
  warp.style.display='block';
  photo.style.visibility='hidden';
 }
 if(showMarkers){
 const line=element('polyline');line.setAttribute('points',keys.slice(0,8).map(k=>`${points[k].x*w},${points[k].y*h}`).join(' '));line.setAttribute('class','line');svg.append(line);
 const seam=element('polyline');seam.setAttribute('points',['leftCorner','upperInnerLeft','upperInner','upperInnerRight','rightCorner','lowerInnerRight','lowerInner','lowerInnerLeft','leftCorner'].map(k=>{const p=points[k as Key];return `${p.x*w},${p.y*h}`;}).join(' '));seam.setAttribute('fill','none');seam.setAttribute('stroke','#4ce0e6');seam.setAttribute('stroke-width',String(side*.003));svg.append(seam);
 for(const key of keys){const p=points[key],x=p.x*w,y=p.y*h;
 const hit=element('circle');hit.setAttribute('cx',String(x));hit.setAttribute('cy',String(y));hit.setAttribute('r',String(side*.045));hit.setAttribute('class','hit');hit.setAttribute('data-key',key);svg.append(hit);
 const dot=element('circle');dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));dot.setAttribute('r',String(side*.013));dot.setAttribute('class','point');if(key.includes('Inner'))dot.setAttribute('style','fill:#4ce0e6');dot.setAttribute('data-key',key);svg.append(dot);
 const label=element('text');label.setAttribute('x',String(x+side*.025));label.setAttribute('y',String(y-side*.017));label.setAttribute('fill','#ffe2a7');label.setAttribute('font-size',String(side*.022));label.textContent=key;svg.append(label);
 }
 }
 output.textContent=JSON.stringify({version:2,image:'IMG_4604.jpeg',landmarks:points},null,2);
 localStorage.setItem(storeKey,JSON.stringify(points));
}
function coords(e:PointerEvent):Point{
 const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
 const matrix=svg.getScreenCTM();if(!matrix)return {x:.5,y:.7};
 const pt=p.matrixTransform(matrix.inverse());return {x:clamp(pt.x/w),y:clamp(pt.y/h)};
}
svg.addEventListener('pointerdown',e=>{
 const k=(e.target as Element).getAttribute('data-key') as Key|null;
 if(!k)return;
 e.preventDefault();active=k;svg.setPointerCapture(e.pointerId);points[k]=coords(e);draw();
});
svg.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();points[active]=coords(e);draw();});
const stop=()=>{active=null};svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);svg.addEventListener('lostpointercapture',stop);
const slider=document.querySelector<HTMLInputElement>('#opening')!;
const choices=document.querySelectorAll<HTMLButtonElement>('[data-viseme]');
const amounts:Record<Viseme,number>=VISEME_AMOUNTS;
choices.forEach(button=>button.addEventListener('click',()=>{
 viseme=button.dataset.viseme as Viseme;
 aimMouth(viseme,amounts[viseme]);slider.value=String(Math.round(amounts[viseme]*100));
 document.querySelector<HTMLOutputElement>('#openingValue')!.value=slider.value+'%';
 choices.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 draw();
}));
slider.addEventListener('input',()=>{targetOpening=Number(slider.value)/100;if(!animationFrame)animationFrame=requestAnimationFrame(animateMouth);document.querySelector<HTMLOutputElement>('#openingValue')!.value=slider.value+'%';draw();});
document.querySelector('#toggleMarkers')!.addEventListener('click',e=>{showMarkers=!showMarkers;(e.currentTarget as HTMLButtonElement).textContent=showMarkers?'Hide markers':'Show markers';draw();});
document.querySelector('#zoomIn')!.addEventListener('click',()=>{zoom=Math.min(10,zoom+1);draw();});
document.querySelector('#zoomOut')!.addEventListener('click',()=>{zoom=Math.max(1,zoom-1);draw();});
document.querySelector('#reset')!.addEventListener('click',()=>{points=structuredClone(defaults);draw();});
document.querySelector('#copy')!.addEventListener('click',async()=>{await navigator.clipboard.writeText(output.textContent||'');});
document.querySelector('#download')!.addEventListener('click',()=>{const blob=new Blob([output.textContent||''],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='piper-mouth-landmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
photo.onload=()=>{w=photo.naturalWidth;h=photo.naturalHeight;draw();};draw();

const speakButton=document.querySelector<HTMLButtonElement>('#speak')!;
const stopButton=document.querySelector<HTMLButtonElement>('#stopSpeaking')!;
let speechTimer:number|undefined;
let speechActive=false;
const phrase='Baby, I am right here with you.';
const spokenWords=[
 {start:0,shapes:['mbp','ah','mbp','ee'] as Viseme[],duration:650},
 {start:6,shapes:['ah'] as Viseme[],duration:250},
 {start:8,shapes:['ah','mbp'] as Viseme[],duration:350},
 {start:11,shapes:['rest','ah','ee','rest'] as Viseme[],duration:500},
 {start:17,shapes:['rest','ee','rest'] as Viseme[],duration:450},
 {start:22,shapes:['rest','ee','rest'] as Viseme[],duration:430},
 {start:27,shapes:['oo','rest'] as Viseme[],duration:400}
];
let currentWord=0,wordStarted=0,lastShape:Viseme='rest';
const facePhoto=document.querySelector<HTMLImageElement>('#speechFace')!;
 // Gentle idle life for Live Oasis: restrained breathing drift plus a quick blink.
 // Keep motion on the portrait only; expression calibration and lip-sync geometry stay untouched.
 if(new URLSearchParams(location.search).has('live')){
  facePhoto.style.transformOrigin='50% 54%';
  facePhoto.style.willChange='transform, filter';
  facePhoto.style.animation='oasis-idle-breathe 5.8s ease-in-out infinite';
  const idleStyle=document.createElement('style');
  idleStyle.textContent=`
   @keyframes oasis-idle-breathe {
    0%,100% { transform:translate3d(0,0,0) scale(1); }
    50% { transform:translate3d(0,-2px,0) scale(1.003); }
   }
   @keyframes oasis-idle-blink {
    0%,100% { transform:scaleY(1); filter:brightness(1); }
    42% { transform:scaleY(.985); filter:brightness(.99); }
    50% { transform:scaleY(.985); filter:brightness(.99); }
   }`;
  document.head.append(idleStyle);
  let blinkTimer:number|undefined;
  const scheduleBlink=()=>{
   blinkTimer=window.setTimeout(()=>{
    if(document.hidden){scheduleBlink();return;}
    facePhoto.animate([{transform:'translate3d(0,0,0) scaleY(1)'},{transform:'translate3d(0,0,0) scaleY(.985)'},{transform:'translate3d(0,0,0) scaleY(1)'}],{duration:135,easing:'ease-in-out'});
    scheduleBlink();
   },3600+Math.random()*2800);
  };
  scheduleBlink();
  window.addEventListener('pagehide',()=>{if(blinkTimer!==undefined)clearTimeout(blinkTimer);},{once:true});
 }
import {approvedExpressions,drawCalibratedFace} from './calibrated-expression-renderer';
const originalExpressionPhoto=new Image();originalExpressionPhoto.src=portraitUrl;
const expressionCanvas=document.createElement('canvas');
const expressionCtx=expressionCanvas.getContext('2d');
let liveExpression='neutral',lastLiveShape='rest';
const expressionPhotos=new Map<string,HTMLImageElement>();
for(const item of approvedExpressions){const image=new Image();image.src=item.photoUrl;image.addEventListener('load',showLiveExpression);expressionPhotos.set(item.filename.replace(/\.json$/,''),image);}
function showLiveExpression(){
 if(!new URLSearchParams(location.search).has('live')||lastLiveShape!=='rest')return;
 const approved=approvedExpressions.find(e=>e.filename===liveExpression+'.json');
 const reference=expressionPhotos.get(liveExpression);
 if(liveExpression==='neutral'||!approved||!reference?.complete||!reference.naturalWidth||!expressionCtx||!originalExpressionPhoto.complete||!originalExpressionPhoto.naturalWidth){facePhoto.src=portraitUrl;return;}
 const result=drawCalibratedFace(expressionCtx,originalExpressionPhoto,reference,approved.map,approved.filename,approved.preset);
 if(result)facePhoto.src=expressionCanvas.toDataURL('image/png');
}
originalExpressionPhoto.addEventListener('load',showLiveExpression);
function setSpeechShape(next:Viseme){
 // One complete photographic face per viseme, never a second mouth overlay.
 viseme=next;
 const image=next==='rest'?null:speechPhotos.get(next as PhotoViseme);
 facePhoto.src=image?.src||portraitUrl;
 slider.value=String(Math.round(amounts[next]*100));
 document.querySelector<HTMLOutputElement>('#openingValue')!.value=slider.value+'%';
 choices.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viseme===next)));
}

function stopSpeech(){
 speechActive=false;
 if(speechTimer!==undefined){window.clearInterval(speechTimer);speechTimer=undefined;}
 window.speechSynthesis.cancel();
 speakButton.disabled=false;
 setSpeechShape('rest');
}
stopButton.addEventListener('click',stopSpeech);
speakButton.addEventListener('click',()=>{
 stopSpeech();
 const utterance=new SpeechSynthesisUtterance(phrase);
 utterance.lang='en-US';utterance.rate=.88;utterance.pitch=1.05;
 utterance.onstart=()=>{
  speechActive=true;speakButton.disabled=true;
  wordStarted=performance.now();currentWord=0;lastShape='rest';
  setSpeechShape('mbp');
  speechTimer=window.setInterval(()=>{
   if(!speechActive)return;
   const now=performance.now();
   // If boundary events are missing (notably on some iOS voices), advance
   // by estimated word duration rather than looping unrelated shapes.
   while(currentWord<spokenWords.length-1 && now-wordStarted>spokenWords[currentWord].duration){
    wordStarted+=spokenWords[currentWord].duration;currentWord++;
   }
   const word=spokenWords[currentWord];
   const elapsed=Math.max(0,now-wordStarted);
   const index=Math.min(word.shapes.length-1,Math.floor(elapsed/word.duration*word.shapes.length));
   const next=word.shapes[index];
   if(next!==lastShape){lastShape=next;setSpeechShape(next);}
  },65);
 };
 utterance.onboundary=(event:SpeechSynthesisEvent)=>{
  if(!speechActive)return;
  const i=spokenWords.findIndex((word,index)=>event.charIndex>=word.start &&
   (index===spokenWords.length-1 || event.charIndex<spokenWords[index+1].start));
  if(i>=0 && i>=currentWord){
   currentWord=i;wordStarted=performance.now();
  }
 };
 utterance.onend=stopSpeech;
 utterance.onerror=stopSpeech;
 window.speechSynthesis.speak(utterance);
});


// Live Oasis: use the original audio-level signal with approved full-face photos.
if(new URLSearchParams(location.search).has('live')){
 let last='rest';
 
 window.addEventListener('message',(event:MessageEvent)=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  const d=event.data as {type?:string;level?:number};
  if(d?.type==='piper-expression'){const expression=(event.data as {expression?:string}).expression;if(expression==='neutral'||approvedExpressions.some(item=>item.filename===expression+'.json')){liveExpression=expression || 'neutral';showLiveExpression();}return;}
  if(d?.type==='piper-viseme'){
   const shape=(event.data as {shape?:string}).shape||'rest';
   if(!['rest','mbp','fv','ah','ee','oo'].includes(shape))return;
   if(shape===last)return;
   last=shape;lastLiveShape=shape;
   if(shape==='rest'){showLiveExpression();return;}
   if(shape==='fv')facePhoto.src=speechPhotos.get('fv')?.src||portraitUrl;
   else setSpeechShape(shape as Viseme);
  }
  // Speech completion also sends a zero audio level from the parent.
 });
}
