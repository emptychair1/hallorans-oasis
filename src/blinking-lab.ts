import neutralMap from '../data/face-maps/neutral.json';
type P={x:number;y:number;z?:number};
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const closure=document.querySelector<HTMLInputElement>('#closure')!;
const speed=document.querySelector<HTMLInputElement>('#speed')!;
const asym=document.querySelector<HTMLInputElement>('#asym')!;
const lashes=document.querySelector<HTMLInputElement>('#lashes')!;
const outputs={closure:document.querySelector<HTMLOutputElement>('#closureOut')!,speed:document.querySelector<HTMLOutputElement>('#speedOut')!,asym:document.querySelector<HTMLOutputElement>('#asymOut')!,lashes:document.querySelector<HTMLOutputElement>('#lashesOut')!};
const image=new Image();image.decoding='async';image.src=new URL('../IMG_4604.jpeg', import.meta.url).href;
const landmarks=(neutralMap as {images:{role:string;landmarks:P[]}[]}).images.find(i=>i.role==='locked-original')!.landmarks;
const eyeDefs=[
 {name:'left',outer:33,inner:133,upper:[160,158],lower:[144,153],brow:70,sign:1},
 {name:'right',outer:263,inner:362,upper:[387,385],lower:[373,380],brow:300,sign:-1}
];
let animationId=0;
function point(id:number){const p=landmarks[id];return {x:p.x*canvas.width,y:p.y*canvas.height};}
function sampleSkin(x:number,y:number):string{
 const sx=Math.max(0,Math.min(canvas.width-1,Math.round(x))),sy=Math.max(0,Math.min(canvas.height-1,Math.round(y)));
 const d=ctx.getImageData(sx,sy,1,1).data;return `rgb(${d[0]},${d[1]},${d[2]})`;
}
function curve(points:{x:number;y:number}[],t:number){const a=points[0],b=points[1],c=points[2];return {x:(1-t)*(1-t)*a.x+2*(1-t)*t*b.x+t*t*c.x,y:(1-t)*(1-t)*a.y+2*(1-t)*t*b.y+t*t*c.y};}
function drawEye(def:typeof eyeDefs[number],amount:number,lash:number){
 const a=point(def.outer),b=point(def.inner),u1=point(def.upper[0]),u2=point(def.upper[1]),l1=point(def.lower[0]),l2=point(def.lower[1]);
 const w=Math.hypot(b.x-a.x,b.y-a.y);
 const upper=[a,{x:(u1.x+u2.x)/2,y:(u1.y+u2.y)/2},b];
 const lower=[a,{x:(l1.x+l2.x)/2,y:(l1.y+l2.y)/2},b];
 const top:{x:number;y:number}[]=[],bottom:{x:number;y:number}[]=[],movingTop:{x:number;y:number}[]=[],movingBottom:{x:number;y:number}[]=[];
 for(let i=0;i<=32;i++){
  const t=i/32,p=curve(upper,t),q=curve(lower,t);
  // Slightly overlap the lid bands so no bright eye-white seam survives at full closure.
  const h=(p.y+q.y)/2,overlap=amount*Math.max(1.5,w*.025);
  top.push(p);bottom.push(q);
  movingTop.push({x:p.x,y:p.y+(h-p.y)*amount+overlap});
  movingBottom.push({x:q.x,y:q.y+(h-q.y)*amount-overlap});
 }
 // Sample several points from the real portrait above and below the eye, then blend a soft skin gradient.
 const sample=(x:number,y:number)=>{const px=Math.max(0,Math.min(canvas.width-1,Math.round(x))),py=Math.max(0,Math.min(canvas.height-1,Math.round(y)));const d=ctx.getImageData(px,py,1,1).data;return [d[0],d[1],d[2]] as number[];};
 const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
 const upperSkin=sample(midX,midY-w*.34),lowerSkin=sample(midX,midY+w*.28);
 const rgb=(c:number[])=>`rgb(${c[0]},${c[1]},${c[2]})`;
 ctx.save();
 // Upper lid skin advances downward; lower lid skin advances upward. They overlap at closure.
 const band=(outer:{x:number;y:number}[],inner:{x:number;y:number}[],upperSide:boolean)=>{
  ctx.beginPath();ctx.moveTo(outer[0].x,outer[0].y);
  for(const p of outer.slice(1))ctx.lineTo(p.x,p.y);
  for(const p of inner.slice().reverse())ctx.lineTo(p.x,p.y);
  ctx.closePath();
  const g=ctx.createLinearGradient(midX,midY-w*.22,midX,midY+w*.22);
  g.addColorStop(0,rgb(upperSkin));g.addColorStop(1,rgb(lowerSkin));
  ctx.fillStyle=g;ctx.fill();
 };
 band(top,movingTop,true);band(bottom,movingBottom,false);
 const seam=movingTop.map((p,i)=>({x:p.x,y:(p.y+movingBottom[i].y)/2}));
 if(amount>.08){
  ctx.beginPath();ctx.moveTo(seam[0].x,seam[0].y);for(const p of seam.slice(1))ctx.lineTo(p.x,p.y);
  ctx.strokeStyle='rgba(78,47,43,'+(0.10+amount*.27)+')';ctx.lineWidth=Math.max(1,w*.012);ctx.stroke();
 }
 if(amount>.42&&lash>0){
  ctx.beginPath();ctx.moveTo(seam[0].x,seam[0].y);for(const p of seam.slice(1))ctx.lineTo(p.x,p.y);
  ctx.strokeStyle='rgba(32,22,25,'+(lash/100*.85)+')';ctx.lineWidth=Math.max(.8,w*(.003+lash/100*.01));ctx.stroke();
 }
 ctx.restore();
}
function draw(){
 if(!image.complete||!image.naturalWidth)return;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const total=Number(closure.value)/100,skew=Number(asym.value)/100;
 drawEye(eyeDefs[0],Math.max(0,Math.min(1,total+skew*.5)),Number(lashes.value));
 drawEye(eyeDefs[1],Math.max(0,Math.min(1,total-skew*.5)),Number(lashes.value));
 outputs.closure.value=Math.round(total*100)+'%';outputs.speed.value=speed.value+' ms';outputs.asym.value=asym.value+'%';outputs.lashes.value=lashes.value+'%';
}
function setPose(value:number,skew=0){closure.value=String(Math.round(value*100));asym.value=String(skew);draw();}
function animatePose(poses:{value:number;skew?:number;hold?:number}[]){
 cancelAnimationFrame(animationId);const duration=Number(speed.value);
 const sequence=async()=>{for(const pose of poses){const from=Number(closure.value)/100,fromSkew=Number(asym.value),to=pose.value,toSkew=pose.skew||0,start=performance.now();await new Promise<void>(resolve=>{const tick=(now:number)=>{const t=Math.min(1,(now-start)/duration);const eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;setPose(from+(to-from)*eased,fromSkew+(toSkew-fromSkew)*eased);if(t<1)animationId=requestAnimationFrame(tick);else resolve();};animationId=requestAnimationFrame(tick);});if(pose.hold)await new Promise(r=>setTimeout(r,pose.hold));}};
 void sequence();
}
image.addEventListener('load',()=>{try{draw();status.textContent='Portrait loaded: '+image.naturalWidth+' × '+image.naturalHeight+' · 478-point landmark map ready.';}catch(error){status.textContent='Portrait loaded, but drawing failed: '+String(error);}});
image.addEventListener('error',()=>{status.textContent='Portrait failed to load from '+image.src;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f4eee6';ctx.font='24px system-ui';ctx.fillText('Portrait failed to load',32,60);});
[closure,lashes,asym].forEach(input=>input.addEventListener('input',draw));speed.addEventListener('input',()=>{outputs.speed.value=speed.value+' ms';});
document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button=>button.addEventListener('click',()=>{
 const action=button.dataset.action;
 if(action==='open'){cancelAnimationFrame(animationId);setPose(0,0);return;}
 if(action==='hold'){cancelAnimationFrame(animationId);setPose(1,0);return;}
 if(action==='normal')animatePose([{value:0},{value:1,hold:35},{value:0}]);
 if(action==='double')animatePose([{value:0},{value:1,hold:35},{value:0,hold:90},{value:1,hold:35},{value:0}]);
 if(action==='bat')animatePose([{value:0},{value:.9,skew:10,hold:35},{value:0,skew:0,hold:65},{value:.85,skew:-8,hold:35},{value:0,skew:0,hold:70},{value:.9,skew:5,hold:35},{value:0}]);
 if(action==='disbelief')animatePose([{value:0},{value:.8,skew:22,hold:45},{value:.2,skew:12,hold:100},{value:.65,skew:-8,hold:35},{value:0}]);
}));
draw();
