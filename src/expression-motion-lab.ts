import {approvedExpressions,drawCalibratedFace} from './calibrated-expression-renderer';
const canvas=document.querySelector<HTMLCanvasElement>('#face')!;
const ctx=canvas.getContext('2d')!;
const select=document.querySelector<HTMLSelectElement>('#expression')!;
const slider=document.querySelector<HTMLInputElement>('#blend')!;
const amount=document.querySelector<HTMLOutputElement>('#amount')!;
const duration=document.querySelector<HTMLInputElement>('#duration')!;
const speed=document.querySelector<HTMLOutputElement>('#speed')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const original=new Image();original.src=new URL('../IMG_4604.jpeg',import.meta.url).href;
const photos=new Map<string,HTMLImageElement>();
for(const expression of approvedExpressions){
 const key=expression.filename.replace(/\.json$/,'');
 const option=document.createElement('option');option.value=key;option.textContent=expression.name;select.append(option);
 const image=new Image();image.src=expression.photoUrl;image.onload=()=>{if(select.value===key)draw();};photos.set(key,image);
}
const preferred=['smile','flirt','wanting','tender','soft-smile','full-smile'];
select.value=preferred.find(name=>photos.has(name))||approvedExpressions[0]?.filename.replace(/\.json$/,'')||'';
let raf=0,token=0,level=0,lastDraw=0;
const ready=(image:HTMLImageElement)=>image.complete&&image.naturalWidth>0;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function draw(){
 if(!ready(original))return;
 const expression=approvedExpressions.find(item=>item.filename===select.value+'.json');
 const photo=photos.get(select.value);
 if(!expression||!photo||!ready(photo)){ctx.drawImage(original,0,0,canvas.width,canvas.height);status.textContent='Waiting for expression reference…';return;}
 const result=drawCalibratedFace(ctx,original,photo,expression.map,expression.filename,expression.preset,level);
 status.textContent=result?'Approved '+expression.name+' reference · intensity '+Math.round(level*100)+'%':'Could not render expression';
}
function setLevel(value:number){level=clamp(value);slider.value=String(Math.round(level*100));amount.textContent=Math.round(level*100)+'%';draw();}
function animate(to:number,ms=Number(duration.value),onDone?:()=>void){
 token++;const run=token;cancelAnimationFrame(raf);
 const from=level,start=performance.now();
 const tick=(now:number)=>{
  if(run!==token)return;
  const t=clamp((now-start)/ms);
  const eased=t*t*(3-2*t);
  if(t===1||now-lastDraw>=32){setLevel(from+(to-from)*eased);lastDraw=now;}
  if(t<1)raf=requestAnimationFrame(tick);else onDone?.();
 };
 raf=requestAnimationFrame(tick);
}
const wait=(ms:number,run:number)=>new Promise<boolean>(resolve=>setTimeout(()=>resolve(token===run),ms));
document.querySelector<HTMLButtonElement>('#in')!.onclick=()=>animate(1);
document.querySelector<HTMLButtonElement>('#out')!.onclick=()=>animate(0);
document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{token++;cancelAnimationFrame(raf);setLevel(0);};
document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>{
 animate(1,Number(duration.value),async()=>{const run=token;if(await wait(1100,run))animate(0,Number(duration.value)*1.35);});
};
select.onchange=()=>{token++;cancelAnimationFrame(raf);setLevel(0);};
slider.oninput=()=>{token++;cancelAnimationFrame(raf);setLevel(Number(slider.value)/100);};
duration.oninput=()=>{speed.textContent=duration.value+' ms';};
original.onload=draw;original.onerror=()=>{status.textContent='Original portrait could not load.';};
draw();
