import portraitUrl from '../IMG_4604.jpeg?url';
import './style.css';
type Pose='rest'|'smile'|'curious'|'blink'|'warm';
type P={x:number;y:number};
const app=document.querySelector<HTMLElement>('#app')!;
document.body.style.cssText='position:static;overflow:auto;touch-action:auto;background:#101014;color:#f5eee8';
app.style.cssText='position:relative;max-width:650px;margin:auto;padding:14px;font:15px system-ui';
app.innerHTML='<h2 style="margin:0 0 8px">Piper · Expression Lab · Bite 17</h2><p style="color:#c5b7ae">Subtle expressions, isolated from the approved mouth and voice.</p><div id="stage" style="position:relative;width:100%;aspect-ratio:1;background:#080808;touch-action:none"><canvas id="face" style="width:100%;height:100%;display:block"></canvas><svg id="points" viewBox="0 0 1 1" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></svg></div><div id="buttons" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0"></div><p style="color:#bdb0a6;font-size:13px">Show markers to position the eyes, brows, and mouth corners. Drag to calibrate; saved locally in this browser. No production files changed.</p>';
const stage=document.querySelector<HTMLElement>('#stage')!;
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
const svg=document.querySelector<SVGSVGElement>('#points')!;
const buttons=document.querySelector<HTMLElement>('#buttons')!;
const defaults:Record<string,P>={leftEye:{x:.40,y:.45},rightEye:{x:.60,y:.45},leftBrow:{x:.40,y:.40},rightBrow:{x:.60,y:.40},leftMouth:{x:.398442418,y:.70192151},rightMouth:{x:.59244926,y:.70099816}};
const key='piper-expression-lab-17';
let anchors:Record<string,P>=structuredClone(defaults);
try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Object.keys(defaults).every(k=>Number.isFinite(saved[k]?.x)&&Number.isFinite(saved[k]?.y)))anchors=saved;}catch{}
let pose:Pose='rest',from:Pose='rest',blend=1,show=false,started=0;
const image=new Image();image.src=portraitUrl;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const poseNames:Record<Pose,string>={rest:'REST',smile:'Soft smile',curious:'Curious',blink:'Slow blink',warm:'Warm eyes'};
for(const name of Object.keys(poseNames) as Pose[]){
 const b=document.createElement('button');b.textContent=poseNames[name];b.dataset.pose=name;
 b.style.cssText='background:#342b30;color:#fff;border:1px solid #8b7261;border-radius:8px;padding:10px';
 b.onclick=()=>{from=pose;pose=name;blend=0;started=performance.now();render();updateButtons();};buttons.append(b);
}
for(const [label,action] of [['Show markers',()=>{show=!show;markers();}],['Reset points',()=>{anchors=structuredClone(defaults);localStorage.removeItem(key);markers();render();}]] as const){
 const b=document.createElement('button');b.textContent=label;b.style.cssText='background:#342b30;color:#fff;border:1px solid #8b7261;border-radius:8px;padding:10px';b.onclick=action;buttons.append(b);
}
function updateButtons(){buttons.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b=>b.style.borderColor=b.dataset.pose===pose?'#ffd08b':'#8b7261');}
function markers(){
 svg.replaceChildren();if(!show)return;
 for(const p of Object.values(anchors)){
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',String(p.x));circle.setAttribute('cy',String(p.y));circle.setAttribute('r','.012');
  circle.setAttribute('fill','#ffcc85');circle.setAttribute('stroke','#1b1110');circle.setAttribute('stroke-width','.003');
  circle.style.cursor='move';circle.style.touchAction='none';
  circle.addEventListener('pointerdown',e=>{e.preventDefault();circle.setPointerCapture(e.pointerId);});
  circle.addEventListener('pointermove',e=>{
   if(!circle.hasPointerCapture(e.pointerId))return;
   const r=svg.getBoundingClientRect();p.x=clamp((e.clientX-r.left)/r.width);p.y=clamp((e.clientY-r.top)/r.height);
   circle.setAttribute('cx',String(p.x));circle.setAttribute('cy',String(p.y));localStorage.setItem(key,JSON.stringify(anchors));render();
  });
  svg.append(circle);
 }
}
function offset(name:string,kind:Pose,x:number,y:number):[number,number]{
 const p=anchors[name],dx=x-p.x,dy=y-p.y;
 const radius=name.includes('Mouth')?.055:name.includes('Brow')?.075:.064;
 const fall=Math.exp(-3*(dx*dx+dy*dy)/(radius*radius));
 const side=name.startsWith('left')?-1:1;
 if(kind==='smile'&&name.includes('Mouth'))return [side*.0035*fall,-.005*fall];
 if(kind==='curious'&&name.includes('Brow'))return [0,-(side===1?.008:.004)*fall];
 if(kind==='blink'&&name.includes('Eye'))return [0,(dy<0?.007:-.007)*fall];
 if(kind==='warm'&&name.includes('Eye'))return [0,(dy<0?.0025:-.0025)*fall];
 if(kind==='warm'&&name.includes('Mouth'))return [side*.0015*fall,-.002*fall];
 return [0,0];
}
function render(){
 if(!image.complete||!image.naturalWidth)return;
 const n=Math.max(1,Math.round(stage.clientWidth));
 if(canvas.width!==n||canvas.height!==n){canvas.width=n;canvas.height=n;}
 const side=Math.min(image.naturalWidth,image.naturalHeight),ox=(image.naturalWidth-side)/2,oy=(image.naturalHeight-side)/2;
 ctx.drawImage(image,ox,oy,side,side,0,0,n,n);
 if(pose==='rest'&&blend>=1)return;
 const src=ctx.getImageData(0,0,n,n),out=ctx.createImageData(n,n);
 const names=Object.keys(anchors);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const xn=x/n,yn=y/n;let dx=0,dy=0;
  for(const name of names){
   const a=offset(name,from,xn,yn),b=offset(name,pose,xn,yn);
   dx+=a[0]*(1-blend)+b[0]*blend;dy+=a[1]*(1-blend)+b[1]*blend;
  }
  const sx=Math.max(0,Math.min(n-1,Math.round(x-dx*n))),sy=Math.max(0,Math.min(n-1,Math.round(y-dy*n)));
  const dest=(y*n+x)*4,source=(sy*n+sx)*4;
  for(let c=0;c<4;c++)out.data[dest+c]=src.data[source+c];
 }
 ctx.putImageData(out,0,0);
}
function tick(now:number){
 if(blend<1){blend=smooth((now-started)/380);render();}
 requestAnimationFrame(tick);
}
image.onload=()=>{render();requestAnimationFrame(tick);};
window.addEventListener('resize',render);
updateButtons();
