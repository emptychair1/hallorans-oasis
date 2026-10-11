import neutralMap from '../data/face-maps/neutral.json';
type P={x:number;y:number;z?:number};
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const closure=document.querySelector<HTMLInputElement>('#closure')!;
const speed=document.querySelector<HTMLInputElement>('#speed')!;
const asym=document.querySelector<HTMLInputElement>('#asym')!;
const lashes=document.querySelector<HTMLInputElement>('#lashes')!;
const upload=document.querySelector<HTMLInputElement>('#closedUpload')!;
const offsetX=document.querySelector<HTMLInputElement>('#offsetX')!;
const offsetY=document.querySelector<HTMLInputElement>('#offsetY')!;
const scale=document.querySelector<HTMLInputElement>('#scale')!;
const outputs={closure:document.querySelector<HTMLOutputElement>('#closureOut')!,speed:document.querySelector<HTMLOutputElement>('#speedOut')!,asym:document.querySelector<HTMLOutputElement>('#asymOut')!,lashes:document.querySelector<HTMLOutputElement>('#lashesOut')!};
const original=new Image();original.decoding='async';original.src=new URL('../IMG_4604.jpeg',import.meta.url).href;
const closed=new Image();closed.decoding='async';
const landmarks=(neutralMap as {images:{role:string;landmarks:P[]}[]}).images.find(i=>i.role==='locked-original')!.landmarks;
const eyeDefs=[{outer:33,inner:133,top:159,bottom:145},{outer:263,inner:362,top:386,bottom:374}];
let animationId=0,run=0,closedReady=false;
const point=(id:number)=>({x:landmarks[id].x*canvas.width,y:landmarks[id].y*canvas.height});
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function eyeBounds(def:typeof eyeDefs[number]){
 const a=point(def.outer),b=point(def.inner),t=point(def.top),d=point(def.bottom);
 const w=Math.hypot(b.x-a.x,b.y-a.y),cx=(a.x+b.x)/2,cy=(t.y+d.y)/2;
 return {cx,cy,w,rx:w*.70,ry:w*.39};
}
function renderEye(def:typeof eyeDefs[number],amount:number){
 if(!closedReady||amount<=0)return;
 const {cx,cy,rx,ry}=eyeBounds(def);
 const k=Number(scale.value)/100,dx=Number(offsetX.value),dy=Number(offsetY.value);
 // Closed reference is positioned using a face-centered registration, not stretched to fit the eye.
 // The user can fine-tune its alignment using the three calibration controls.
 const referenceCenterX=closed.naturalWidth*.5,referenceCenterY=closed.naturalHeight*.5;
 const targetCenterX=canvas.width*.5,targetCenterY=canvas.height*.5;
 const destW=closed.naturalWidth*k,destH=closed.naturalHeight*k;
 const destX=targetCenterX-referenceCenterX*k+dx,destY=targetCenterY-referenceCenterY*k+dy;
 ctx.save();
 // Soft elliptical mask confines every pixel change to the eyelid region.
 // Expand with closure so lashes and crease are present without a hard cutout.
 const feather=Math.max(5,rx*.22);
 const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;
 const mc=mask.getContext('2d')!;
 mc.drawImage(closed,destX,destY,destW,destH);
 mc.globalCompositeOperation='destination-in';
 const g=mc.createRadialGradient(cx,cy,Math.max(1,rx-feather)*.45,cx,cy,rx);
 g.addColorStop(0,'rgba(0,0,0,1)');
 g.addColorStop(.65,'rgba(0,0,0,1)');
 g.addColorStop(1,'rgba(0,0,0,0)');
 mc.save();mc.translate(cx,cy);mc.scale(1,ry/rx);mc.translate(-cx,-cy);
 mc.fillStyle=g;mc.fillRect(cx-rx-2,cy-rx-2,rx*2+4,rx*2+4);mc.restore();
 mc.globalCompositeOperation='source-over';
 ctx.globalAlpha=clamp(amount);
 ctx.drawImage(mask,0,0);
 ctx.restore();
}
function draw(){
 if(!original.complete||!original.naturalWidth)return;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(original,0,0,canvas.width,canvas.height);
 const total=Number(closure.value)/100,skew=Number(asym.value)/100;
 renderEye(eyeDefs[0],clamp(total+skew*.5));
 renderEye(eyeDefs[1],clamp(total-skew*.5));
 outputs.closure.value=Math.round(total*100)+'%';outputs.speed.value=speed.value+' ms';outputs.asym.value=asym.value+'%';outputs.lashes.value=lashes.value+'%';
}
function setPose(value:number,skew=0){closure.value=String(Math.round(value*100));asym.value=String(Math.round(skew));draw();}
function animatePose(poses:{value:number;skew?:number;hold?:number}[]){
 cancelAnimationFrame(animationId);const current=++run;const duration=Number(speed.value);
 const sequence=async()=>{for(const pose of poses){if(current!==run)return;const from=Number(closure.value)/100,fromSkew=Number(asym.value),to=pose.value,toSkew=pose.skew||0,start=performance.now();await new Promise<void>(resolve=>{const tick=(now:number)=>{if(current!==run){resolve();return;}const t=Math.min(1,(now-start)/duration);const eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;setPose(from+(to-from)*eased,fromSkew+(toSkew-fromSkew)*eased);if(t<1)animationId=requestAnimationFrame(tick);else resolve();};animationId=requestAnimationFrame(tick);});if(pose.hold)await new Promise(r=>setTimeout(r,pose.hold));}};
 void sequence();
}
function loadClosed(src:string){
 closedReady=false;closed.onload=()=>{closedReady=true;status.textContent='Open portrait + closed-eye reference ready. Adjust alignment if needed.';draw();};
 closed.onerror=()=>{closedReady=false;status.textContent='Could not load closed-eye reference. Upload the image below.';draw();};
 closed.src=src;
}
original.onload=()=>{draw();status.textContent='Original portrait and 478 landmarks loaded. Upload the closed-eye image to begin.';};
original.onerror=()=>{status.textContent='Original portrait failed to load.';};
upload.addEventListener('change',()=>{const file=upload.files?.[0];if(!file)return;const url=URL.createObjectURL(file);closed.onload=()=>{URL.revokeObjectURL(url);closedReady=true;status.textContent='Closed-eye reference loaded: '+closed.naturalWidth+' × '+closed.naturalHeight+'.';draw();};closed.onerror=()=>{URL.revokeObjectURL(url);status.textContent='Failed to decode uploaded image.';};closed.src=url;});
[closure,asym,lashes,offsetX,offsetY,scale].forEach(input=>input.addEventListener('input',draw));
speed.addEventListener('input',draw);
document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button=>button.addEventListener('click',()=>{
 const action=button.dataset.action;
 if(action==='open'){run++;cancelAnimationFrame(animationId);setPose(0);return;}
 if(action==='hold'){run++;cancelAnimationFrame(animationId);setPose(1);return;}
 if(action==='normal')animatePose([{value:0},{value:1,hold:35},{value:0}]);
 if(action==='double')animatePose([{value:0},{value:1,hold:35},{value:0,hold:90},{value:1,hold:35},{value:0}]);
 if(action==='bat')animatePose([{value:0},{value:.9,skew:10,hold:35},{value:0,hold:65},{value:.85,skew:-8,hold:35},{value:0,hold:70},{value:.9,skew:5,hold:35},{value:0}]);
 if(action==='disbelief')animatePose([{value:0},{value:.8,skew:22,hold:45},{value:.2,skew:12,hold:100},{value:.65,skew:-8,hold:35},{value:0}]);
}));
loadClosed('/closed-eyes-reference.jpg');
draw();
