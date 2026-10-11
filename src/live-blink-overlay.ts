// Isolated photographic blink overlay for Live Oasis.
// Does not change speechFace, expression selection, viseme swapping, or mouth calibration.
import neutralMap from '../data/face-maps/neutral.json';
import closedEyeUrl from '../assets/ad3261163d764c34291dd6dfb0612bfa7f0a42ea92becd0ab5d9549211479970.png?url';

type Point={x:number;y:number};
const canvas=document.querySelector<HTMLCanvasElement>('#blinkOverlay');
const isLive=new URLSearchParams(location.search).has('live') || location.pathname.endsWith('/speech-expression-integration.html');
if(canvas && isLive){
 const ctx=canvas.getContext('2d');
 const closed=new Image();
 const landmarks=(neutralMap as {images:{role:string;landmarks:Point[]}[]}).images.find(i=>i.role==='locked-original')!.landmarks;
 const mask=document.createElement('canvas');
 mask.width=canvas.width;mask.height=canvas.height;
 const mc=mask.getContext('2d');
 let raf=0,activeAt=0,nextAt=performance.now()+2200,ready=false;
 const eyeDefs=[{outer:33,inner:133,top:159,bottom:145},{outer:263,inner:362,top:386,bottom:374}];
 function render(amount:number){
  if(!ctx||!mc||!canvas)return;
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  if(!ready||amount<=0)return;
  const k=1.15;
  const destW=closed.naturalWidth*k,destH=closed.naturalHeight*k;
  const destX=w*.5-closed.naturalWidth*.5*k,destY=h*.5-closed.naturalHeight*.5*k;
  for(const def of eyeDefs){
   const a=landmarks[def.outer],b=landmarks[def.inner],t=landmarks[def.top],d=landmarks[def.bottom];
   const width=Math.hypot((b.x-a.x)*w,(b.y-a.y)*h);
   const cx=(a.x+b.x)*w/2,cy=(t.y+d.y)*h/2,rx=width*.70,ry=width*.39;
   const feather=Math.max(5,rx*.22);
   mc.setTransform(1,0,0,1,0,0);
   mc.clearRect(0,0,mask.width,mask.height);
   mc.globalCompositeOperation='source-over';
   mc.drawImage(closed,destX,destY,destW,destH);
   mc.globalCompositeOperation='destination-in';
   mc.save();mc.translate(cx,cy);mc.scale(1,ry/rx);
   const gradient=mc.createRadialGradient(0,0,Math.max(1,rx-feather),0,0,rx);
   gradient.addColorStop(0,'rgba(0,0,0,1)');
   gradient.addColorStop(1,'rgba(0,0,0,0)');
   mc.fillStyle=gradient;mc.beginPath();mc.arc(0,0,rx,0,Math.PI*2);mc.fill();mc.restore();
   mc.globalCompositeOperation='source-over';
   ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,amount));ctx.drawImage(mask,0,0);ctx.restore();
  }
 }
 function tick(now:number){
  if(!activeAt && now>=nextAt)activeAt=now;
  if(activeAt){
   const t=now-activeAt;
   // Close, hold briefly, reopen. Keep every other frame transparent.
   const amount=t<105?t/105:t<145?1:t<270?1-(t-145)/125:0;
   render(amount);
   if(t>=270){activeAt=0;nextAt=now+2800+Math.random()*3100;}
  }
  raf=requestAnimationFrame(tick);
 }
 closed.addEventListener('load',()=>{ready=true;render(0);});
 closed.addEventListener('error',()=>{ready=false;});
 closed.src=closedEyeUrl;
 raf=requestAnimationFrame(tick);
 window.addEventListener('pagehide',()=>cancelAnimationFrame(raf),{once:true});
}
