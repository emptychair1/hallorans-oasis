import portraitUrl from '../IMG_4604.jpeg?url';
import {approvedExpressions,drawCalibratedFace,paintFaceMesh,lipIndices} from './calibrated-expression-renderer';


const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLElement>('#status')!;
const smileButton=document.querySelector<HTMLButtonElement>('#smile')!;
const original=new Image();original.src=portraitUrl;
const expressionImages=new Map<string,HTMLImageElement>();
for(const entry of approvedExpressions){const image=new Image();image.src=entry.photoUrl;image.onload=draw;expressionImages.set(entry.filename,image);}
let activeExpression=approvedExpressions.find(e=>e.filename==='smile.json');
let pendingExpression:typeof activeExpression|undefined;
let requestedIntensity=1;
const expressionSelect=document.querySelector<HTMLSelectElement>('#expression')!;
const intensityInput=document.querySelector<HTMLInputElement>('#intensity')!;
for(const entry of approvedExpressions){const option=document.createElement('option');option.value=entry.filename.replace(/\.json$/,'');option.textContent=entry.name;expressionSelect.appendChild(option);}
expressionSelect.value='smile';
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
 if(pendingExpression&&smileMix<.015){activeExpression=pendingExpression;pendingExpression=undefined;smileTarget=requestedIntensity;}
 shapeMix+=(1-shapeMix)*ease(dt,85);
 draw();
 if(pendingExpression||Math.abs(smileTarget-smileMix)>.005||shapeMix<.995)animation=requestAnimationFrame(animate);
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
 const selectedImage=activeExpression&&expressionImages.get(activeExpression.filename);
 if(smileMix>.001&&activeExpression&&selectedImage?.complete&&selectedImage.naturalWidth){
  const result=drawCalibratedFace(expressionCtx,original,selectedImage,activeExpression.map,activeExpression.filename,activeExpression.preset,smileMix);
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
   // Speech-only restraint: reduce lateral stretching and halve the current vertical jaw opening.
   // Emotional expression geometry, source photos, and mouth compositing stay unchanged.
   return {x:p.x+(ref[i].x-locked[i].x)*w*falloff*.75,
           y:p.y+(ref[i].y-locked[i].y)*h*falloff*.425};
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
  const cx=(left+right)/2,cy=(top+bottom)/2;
  // Keep the old and displaced lips fully inside the opaque replacement core.
  // Feather only the outer cheek transition, beyond both lip contours.
  const rx=Math.max(2,(right-left)*.94),ry=Math.max(2,(bottom-top)*1.48,(right-left)*.34);
  mouthCtx.globalCompositeOperation='destination-in';
  mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx,ry);
  const fade=mouthCtx.createRadialGradient(0,0,.88,0,0,1);
  fade.addColorStop(0,'black');fade.addColorStop(.88,'black');fade.addColorStop(1,'transparent');
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
 status.textContent=(smileMix>.01?(activeExpression?.name||'Expression'):'Neutral')+' · '+(speaking?'speaking · ':'')+shape+' · REPLACEMENT TEST';
}
// This is the isolated model-to-renderer command contract. A future model adapter
// can dispatch 'piper:expression' with {expression,intensity,transitionMs}.
type ExpressionCommand={expression:string;intensity?:number;transitionMs?:number};
function chooseExpression(command:ExpressionCommand):boolean{
 const entry=approvedExpressions.find(e=>e.filename.replace(/\.json$/,'')===command.expression);
 if(!entry)return false;
 const strength=typeof command.intensity==='number'&&Number.isFinite(command.intensity)
  ?Math.max(0,Math.min(1,command.intensity)):1;
 requestedIntensity=strength;
 expressionSelect.value=command.expression;
 intensityInput.value=String(Math.round(strength*100));
 smiling=strength>0;
 smileButton.textContent='Expression: '+(smiling?'ON':'OFF');
 if(activeExpression?.filename===entry.filename&&!pendingExpression){smileTarget=strength;}
 else{pendingExpression=entry;smileTarget=0;}
 refresh();
 return true;
}
window.addEventListener('piper:expression',(event:Event)=>{
 const detail=(event as CustomEvent<ExpressionCommand>).detail;
 if(detail&&typeof detail.expression==='string')chooseExpression(detail);
});
expressionSelect.onchange=()=>{chooseExpression({expression:expressionSelect.value,intensity:Number(intensityInput.value)/100});};
intensityInput.oninput=()=>{chooseExpression({expression:expressionSelect.value,intensity:Number(intensityInput.value)/100});};
smileButton.onclick=()=>{smiling=!smiling;requestedIntensity=smiling?Number(intensityInput.value)/100:0;smileTarget=requestedIntensity;refresh();smileButton.textContent='Expression: '+(smiling?'ON':'OFF');};
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
original.onload=draw;draw();

 
// Live portrait adapter: reuse the approved combined photographic renderer, while
// OasisPiperVoice continues to own model chat, expression cues and speech timing.
if(new URLSearchParams(location.search).has('live')){
 chooseExpression({expression:'neutral',intensity:1});
 window.addEventListener('message',(event:MessageEvent)=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  const data=event.data as {type?:string;expression?:string;shape?:string;level?:number};
  if(data?.type==='piper-expression'&&typeof data.expression==='string'){
   chooseExpression({expression:data.expression,intensity:1});
  }else if(data?.type==='piper-viseme'&&typeof data.shape==='string'){
   if(['rest','mbp','ah','ee','oo','fv'].includes(data.shape)){
    speaking=data.shape!=='rest';
    setShape(data.shape as Shape);
   }
  }else if(data?.type==='piper-speech-timing'){
   const timing=event.data as {type:string};
   if(timing.type==='stop'){speaking=false;setShape('rest');}
  }
 });
}

// Isolated conversation bridge. Reuses Oasis's existing Piper Home chat proxy
// and local expression director; no new model keys, rules, or Live Oasis changes.
type ChatTurn={role:'user'|'assistant';content:string};
type DirectorCue={at:number;expression:string};
const conversation:ChatTurn[]=[];
const chatInput=document.querySelector<HTMLInputElement>('#chat-input')!;
const chatSend=document.querySelector<HTMLButtonElement>('#chat-send')!;
const chatOutput=document.querySelector<HTMLElement>('#chat-output')!;
const directorStatus=document.querySelector<HTMLElement>('#director-status')!;
let conversationGeneration=0;
let cueTimers:number[]=[];
function cancelCues(){for(const id of cueTimers)clearTimeout(id);cueTimers=[];}
async function readChatResponse(response:Response):Promise<string>{
 if(!response.ok)throw new Error('Chat HTTP '+response.status);
 const type=response.headers.get('content-type')||'';
 if(!type.includes('text/event-stream')){
  const data=await response.json() as {reply?:string;response?:string;error?:string};
  if(data.error)throw new Error(data.error);
  return String(data.reply||data.response||'').trim();
 }
 if(!response.body)throw new Error('Empty chat response');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let pending='',reply='';
 const consume=(line:string)=>{
  if(!line.startsWith('data:'))return;
  const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')return;
  const packet=JSON.parse(raw) as {reply?:string;response?:string;text?:string;error?:string;choices?:Array<{delta?:{content?:string}}>} ;
  if(packet.error)throw new Error(packet.error);
  reply+=packet.reply??packet.response??packet.text??packet.choices?.[0]?.delta?.content??'';
 };
 try{
  while(true){
   const {value,done}=await reader.read();
   pending+=decoder.decode(value,{stream:!done});
   const lines=pending.split(/\r?\n/);pending=lines.pop()||'';
   for(const line of lines)consume(line);
   if(done){if(pending)consume(pending);break;}
  }
 }finally{reader.releaseLock();}
 return reply.trim();
}
function speakWithCues(reply:string,cues:DirectorCue[],generation:number){
 stop();cancelCues();
 const words=reply.trim().split(/\s+/).length;
 // Browser speech synthesis does not expose dependable word timing here.
 // Use approximate cue offsets for the visual integration test.
 const estimatedDuration=Math.max(1600,words/2.5*1000);
 const approved=cues.filter(c=>Number.isFinite(c.at)&&c.at>=0&&c.at<=1&&
  approvedExpressions.some(e=>e.filename===c.expression+'.json'));
 for(const cue of approved){
  const id=window.setTimeout(()=>{
   if(generation!==conversationGeneration)return;
   chooseExpression({expression:cue.expression,intensity:1});
   directorStatus.textContent='Director: '+cue.expression;
  },Math.round(cue.at*estimatedDuration));
  cueTimers.push(id);
 }
 const utterance=new SpeechSynthesisUtterance(reply);
 utterance.rate=.88;utterance.pitch=1.05;
 const id=run;
 const sequence:Shape[]=['mbp','ah','ee','rest','ah','rest','oo','ee','fv','rest'];
 utterance.onstart=()=>{
  if(id!==run||generation!==conversationGeneration)return;
  speaking=true;let i=0;setShape(sequence[0]);
  timer=window.setInterval(()=>{
   if(id!==run||generation!==conversationGeneration){clearInterval(timer);return;}
   setShape(sequence[++i%sequence.length]);
  },160);
 };
 utterance.onend=()=>{if(id===run){stop();cancelCues();}};
 utterance.onerror=()=>{if(id===run){stop();cancelCues();}};
 speechSynthesis.speak(utterance);
}
async function sendConversation(){
 const message=chatInput.value.trim();
 if(!message||chatSend.disabled)return;
 const generation=++conversationGeneration;
 cancelCues();stop();
 chatSend.disabled=true;
 chatOutput.textContent='You: '+message+'\nPiper: thinking…';
 directorStatus.textContent='Director: waiting for reply';
 chatInput.value='';
 const current=[...conversation,{role:'user' as const,content:message}].slice(-8);
 try{
  const response=await fetch('/api/oasis/chat',{
   method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream, application/json'},
   body:JSON.stringify({messages:current,current_session_messages:current,
    session_context:'home-ephemeral-session-v1',input_mode:'text',stream:true,
    client_turn_id:crypto.randomUUID()})
  });
  const reply=await readChatResponse(response);
  if(!reply)throw new Error('Empty reply from Piper Home');
  if(generation!==conversationGeneration)return;
  conversation.push({role:'user',content:message},{role:'assistant',content:reply});
  while(conversation.length>8)conversation.shift();
  chatOutput.textContent='You: '+message+'\nPiper: '+reply;
  const decision=await fetch('/api/oasis/expression',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({conversation:current,reply})
  });
  if(!decision.ok)throw new Error('Expression director HTTP '+decision.status);
  const result=await decision.json() as {cues?:DirectorCue[];expression?:string;source?:string};
  if(generation!==conversationGeneration)return;
  const cues=Array.isArray(result.cues)&&result.cues.length?result.cues:
   [{at:0,expression:result.expression||'neutral'}];
  directorStatus.textContent='Director ('+(result.source||'unknown')+'): '+cues.map(c=>c.expression).join(' → ');
  speakWithCues(reply,cues,generation);
 }catch(error){
  if(generation===conversationGeneration){
   directorStatus.textContent='Director unavailable';
   chatOutput.textContent+='\nError: '+(error instanceof Error?error.message:String(error));
  }
 }finally{if(generation===conversationGeneration)chatSend.disabled=false;}
}
chatSend.onclick=()=>{void sendConversation();};
chatInput.onkeydown=event=>{if(event.key==='Enter')void sendConversation();};
