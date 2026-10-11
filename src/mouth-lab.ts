import portraitUrl from '../IMG_4604.jpeg?url';
type Point = {x:number;y:number};
type Key = 'leftCorner'|'rightCorner'|'upperCenter'|'lowerCenter'|'cupidLeft'|'cupidRight'|'lowerLeft'|'lowerRight'|'upperInner'|'lowerInner'|'upperInnerLeft'|'upperInnerRight'|'lowerInnerLeft'|'lowerInnerRight';
const keys:Key[]=['leftCorner','cupidLeft','upperCenter','cupidRight','rightCorner','lowerRight','lowerCenter','lowerLeft','upperInner','lowerInner','upperInnerLeft','upperInnerRight','lowerInnerLeft','lowerInnerRight'];
// Calibrated by Josh on the original IMG_4604.jpeg; do not overwrite with estimates.
const defaults = {"leftCorner":{"x":0.3986245916494381,"y":0.7050609113015908},"cupidLeft":{"x":0.46311136622667515,"y":0.6756980154704966},"upperCenter":{"x":0.48169230039692007,"y":0.6873323763636608},"cupidRight":{"x":0.5101101966709075,"y":0.6668337480015316},"rightCorner":{"x":0.5942709472242101,"y":0.698966737256825},"lowerRight":{"x":0.5407141247879559,"y":0.7288836202842863},"lowerCenter":{"x":0.4991802445299247,"y":0.735531834006207},"lowerLeft":{"x":0.43578645998992793,"y":0.7316537137084856}} as Record<Key,Point>;
const svg=document.querySelector<SVGSVGElement>('#overlay')!;
const output=document.querySelector<HTMLElement>('#output')!;
defaults.upperInner={x:0.4844248013743109,y:0.6995207244531921};defaults.lowerInner={x:0.49152926250066264,y:0.7111550853463564};
defaults.upperInnerLeft={x:0.4461699429965808,y:0.6995207244531921};defaults.upperInnerRight={x:0.5226796597520409,y:0.6967506310289929};
defaults.lowerInnerLeft={x:0.46529734630115566,y:0.7089390315993122};defaults.lowerInnerRight={x:0.5407141247879559,y:0.7039528844280686};
const storeKey='piper-mouth-lab-05-calibrated';
let points:Record<Key,Point>=structuredClone(defaults);
try{const saved=JSON.parse(localStorage.getItem(storeKey)||'null');if(saved&&keys.every(k=>Number.isFinite(saved[k]?.x)&&Number.isFinite(saved[k]?.y)))points=saved;}catch{/* ignore */}
let zoom=5,active:Key|null=null,w=1000,h=1000;
let showMarkers=true,opening=0;
const ns='http://www.w3.org/2000/svg';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const element=(name:string)=>document.createElementNS(ns,name);
const photo=document.querySelector<HTMLImageElement>('#portrait')!;
photo.src=portraitUrl;
function draw(){
 const side=Math.min(w,h)/zoom, cx=.5*w,cy=.707*h;
 svg.setAttribute('viewBox',`${cx-side/2} ${cy-side/2} ${side} ${side}`);
 svg.replaceChildren();
 // Keep the portrait in HTML instead of an SVG <image>, which can fail on mobile.
 const stage=svg.parentElement!;
 const pixels=stage.clientWidth/side;
 photo.style.width=(w*pixels)+'px';
 photo.style.height=(h*pixels)+'px';
 photo.style.left=(-(cx-side/2)*pixels)+'px';
 photo.style.top=(-(cy-side/2)*pixels)+'px';
 // Bite 05 experimental preview: anchored upper edge, downward-translated lower-lip photo.
 if(opening>0 && photo.complete && photo.naturalWidth){
  const shift=opening*.022*h;
  const lx=points.leftCorner.x*w,rx=points.rightCorner.x*w;
  const upper=points.upperInner.y*h,lower=points.lowerInner.y*h;
  const mid=(lx+rx)/2;
  const gap=element('path');
  gap.setAttribute('d',`M ${lx} ${points.leftCorner.y*h} Q ${mid} ${upper} ${rx} ${points.rightCorner.y*h} Q ${mid} ${lower+shift} ${lx} ${points.leftCorner.y*h} Z`);
  gap.setAttribute('fill','#30191e');svg.append(gap);
  // Move source photo pixels from the lower lip through the chin as one clipped region.
  const defs=element('defs'),clip=element('clipPath');
  clip.setAttribute('id','moving-lower-lip');
  const region=element('path');
  const topY=Math.min(points.lowerInnerLeft.y,points.lowerInner.y,points.lowerInnerRight.y)*h;
  const bottomY=(points.lowerCenter.y+.065)*h;
  region.setAttribute('d',`M ${lx} ${points.leftCorner.y*h} Q ${mid} ${topY} ${rx} ${points.rightCorner.y*h} L ${(points.rightCorner.x+.025)*w} ${bottomY} L ${(points.leftCorner.x-.025)*w} ${bottomY} Z`);
  clip.append(region);defs.append(clip);svg.append(defs);
  const moving=element('image');
  moving.setAttribute('href',portraitUrl);moving.setAttribute('width',String(w));moving.setAttribute('height',String(h));
  moving.setAttribute('clip-path','url(#moving-lower-lip)');
  moving.setAttribute('transform',`translate(0 ${shift})`);
  svg.append(moving);
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
slider.addEventListener('input',()=>{opening=Number(slider.value)/100;document.querySelector<HTMLOutputElement>('#openingValue')!.value=slider.value+'%';draw();});
document.querySelector('#toggleMarkers')!.addEventListener('click',e=>{showMarkers=!showMarkers;(e.currentTarget as HTMLButtonElement).textContent=showMarkers?'Hide markers':'Show markers';draw();});
document.querySelector('#zoomIn')!.addEventListener('click',()=>{zoom=Math.min(10,zoom+1);draw();});
document.querySelector('#zoomOut')!.addEventListener('click',()=>{zoom=Math.max(2,zoom-1);draw();});
document.querySelector('#reset')!.addEventListener('click',()=>{points=structuredClone(defaults);draw();});
document.querySelector('#copy')!.addEventListener('click',async()=>{await navigator.clipboard.writeText(output.textContent||'');});
document.querySelector('#download')!.addEventListener('click',()=>{const blob=new Blob([output.textContent||''],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='piper-mouth-landmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
photo.onload=()=>{w=photo.naturalWidth;h=photo.naturalHeight;draw();};draw();
