// V9.1: Face Transfer Lab's approved renderer, extracted without changing its geometry/texture formulas.
// This module owns the expression algorithm for both the lab and future Live Oasis integration.
import presetData from '../data/expression-presets.json';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
export type Point = {x:number;y:number;z?:number};
export type FaceImage = {role:string;filename:string;landmarks:Point[]};
export type FaceMap = {expressionName?:string;images:FaceImage[]};
export type ExpressionPreset = {geometry:number;texture:number;cheekWarmth:number};
export type ApprovedExpression = {filename:string;name:string;map:FaceMap;preset:ExpressionPreset;photoUrl:string};
export type DrawResult = {destination:Point[];width:number;height:number};
export const expressionMaps = import.meta.glob('../data/face-maps/*.json',{eager:true,import:'default'}) as Record<string,FaceMap>;
export const expressionPhotoUrls = import.meta.glob('../assets/expressions/*.{png,jpg,jpeg,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export const expressionPresets = presetData.presets as Record<string,ExpressionPreset>;
export const approvedExpressions:ApprovedExpression[] = Object.entries(expressionPresets).flatMap(([filename,preset])=>{
 const map=Object.entries(expressionMaps).find(([path])=>path.endsWith('/'+filename))?.[1];
 const reference=map?.images.find(i=>i.role==='expression-reference');
 const photoUrl=Object.entries(expressionPhotoUrls).find(([path])=>path.endsWith('/'+reference?.filename))?.[1];
 if(!map||map.images.length!==2||map.images.some(i=>i.landmarks.length!==478)||!photoUrl)return [];
 return [{filename,name:map.expressionName||filename.replace(/\.json$/,''),map,preset,photoUrl}];
});

const edges=FaceLandmarker.FACE_LANDMARKS_TESSELATION;
const adjacency=new Map<number,Set<number>>();
for(const e of edges){for(const [a,b] of [[e.start,e.end],[e.end,e.start]]){if(!adjacency.has(a))adjacency.set(a,new Set());adjacency.get(a)!.add(b);}}
const triangles:number[][]=[], seen=new Set<string>();
for(const [a,neighbors] of adjacency)for(const b of neighbors)for(const c of neighbors){if(b===c||!adjacency.get(b)?.has(c))continue;const ids=[a,b,c].sort((x,y)=>x-y),key=ids.join('-');if(!seen.has(key)){seen.add(key);triangles.push(ids);}}
function bounds(points:Point[]){const x=points.map(p=>p.x),y=points.map(p=>p.y);return {minX:Math.min(...x),minY:Math.min(...y),w:Math.max(...x)-Math.min(...x),h:Math.max(...y)-Math.min(...y)};}
function affine(a:Point,b:Point,c:Point,d:Point,e:Point,f:Point){const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);if(Math.abs(det)<1e-7)return null;const u=(e.x-d.x),v=(f.x-d.x),w=(e.y-d.y),z=(f.y-d.y);const A=(u*(c.y-a.y)-v*(b.y-a.y))/det,B=(w*(c.y-a.y)-z*(b.y-a.y))/det,C=(v*(b.x-a.x)-u*(c.x-a.x))/det,D=(z*(b.x-a.x)-w*(c.x-a.x))/det;return [A,B,C,D,d.x-A*a.x-C*a.y,d.y-B*a.x-D*a.y] as const;}
function paint(source:HTMLImageElement,from:Point[],to:Point[],alpha:number,overlap=0,out:CanvasRenderingContext2D){if(!alpha)return;out.save();out.globalAlpha=alpha;for(const ids of triangles){const [i,j,k]=ids;const a=from[i],b=from[j],c=from[k],d=to[i],e=to[j],f=to[k];const matrix=affine(a,b,c,d,e,f);if(!matrix)continue;out.save();out.beginPath();const mx=(d.x+e.x+f.x)/3,my=(d.y+e.y+f.y)/3;const expand=(p:Point)=>{const dx=p.x-mx,dy=p.y-my,len=Math.hypot(dx,dy)||1;return {x:p.x+overlap*dx/len,y:p.y+overlap*dy/len};};const da=expand(d),ea=expand(e),fa=expand(f);out.moveTo(da.x,da.y);out.lineTo(ea.x,ea.y);out.lineTo(fa.x,fa.y);out.closePath();out.clip();out.setTransform(...matrix);out.drawImage(source,0,0);out.restore();}out.restore();}

// Isolated reference-mouth layer: replace the ghosted interior with one source mouth.
// The soft oval mask avoids the hard rectangular boundaries of earlier experiments.
const mouthCanvas=document.createElement('canvas');
const mouthCtx=mouthCanvas.getContext('2d')!;
export const lipIndices=[...new Set(FaceLandmarker.FACE_LANDMARKS_LIPS.flatMap(e=>[e.start,e.end]))];

function paintContinuousMouth(ctx:CanvasRenderingContext2D,ref:HTMLImageElement,reference:Point[],destination:Point[],strength:number,w:number,h:number){
 if(strength<=0)return;
 const refPts=lipIndices.map(i=>reference[i]),dstPts=lipIndices.map(i=>destination[i]);
 const box=(pts:Point[])=>({left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))});
 const a=box(refPts),b=box(dstPts);
 const aw=Math.max(1,a.right-a.left),ah=Math.max(1,a.bottom-a.top);
 const bw=Math.max(1,b.right-b.left),bh=Math.max(1,b.bottom-b.top);
 const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
 const rx=bw*.69,ry=bh*.96;
 // Copy actual reference teeth and mouth as one continuous image, not a triangulated lip mesh.
 mouthCanvas.width=w;mouthCanvas.height=h;
 mouthCtx.save();
 mouthCtx.translate(cx,cy);
 mouthCtx.scale(bw/aw,bh/ah);
 mouthCtx.translate(-(a.left+a.right)/2,-(a.top+a.bottom)/2);
 mouthCtx.drawImage(ref,0,0);
 mouthCtx.restore();
 mouthCtx.globalCompositeOperation='destination-in';
 mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx,ry);
 const mask=mouthCtx.createRadialGradient(0,0,.70,0,0,1);
 mask.addColorStop(.70,'#000');mask.addColorStop(1,'transparent');
 mouthCtx.fillStyle=mask;mouthCtx.beginPath();mouthCtx.arc(0,0,1,0,Math.PI*2);mouthCtx.fill();
 mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=Math.min(1,strength);ctx.drawImage(mouthCanvas,0,0);ctx.restore();
}

function paintMouth(ctx:CanvasRenderingContext2D,ref:HTMLImageElement,reference:Point[],destination:Point[],strength:number,w:number,h:number){
 if(strength<=0)return;
 const pts=lipIndices.map(i=>destination[i]);
 const left=Math.min(...pts.map(p=>p.x)),right=Math.max(...pts.map(p=>p.x));
 const top=Math.min(...pts.map(p=>p.y)),bottom=Math.max(...pts.map(p=>p.y));
 const cx=(left+right)/2,cy=(top+bottom)/2;
 const rx=Math.max(2,(right-left)*.61),ry=Math.max(2,(bottom-top)*.77);
 mouthCanvas.width=w;mouthCanvas.height=h;
 paint(ref,reference,destination,1,.45,mouthCtx);
 mouthCtx.globalCompositeOperation='destination-in';
 const radius=Math.max(rx,ry);
 // Elliptical radial falloff: full reference mouth at center, feathered lip perimeter.
 mouthCtx.save();mouthCtx.translate(cx,cy);mouthCtx.scale(rx/radius,ry/radius);
 const mask=mouthCtx.createRadialGradient(0,0,radius*.58,0,0,radius);
 mask.addColorStop(0,'rgba(0,0,0,1)');mask.addColorStop(1,'rgba(0,0,0,0)');
 mouthCtx.fillStyle=mask;mouthCtx.beginPath();mouthCtx.arc(0,0,radius,0,Math.PI*2);mouthCtx.fill();
 mouthCtx.restore();mouthCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=Math.min(1,strength);ctx.drawImage(mouthCanvas,0,0);ctx.restore();
}
// Full Laugh only: feather reference texture out before the upper forehead/hairline.
const foreheadCanvas=document.createElement('canvas');
const foreheadCtx=foreheadCanvas.getContext('2d')!;
function paintFeatheredForeheadTexture(ctx:CanvasRenderingContext2D,ref:HTMLImageElement,reference:Point[],destination:Point[],alpha:number,w:number,h:number){
 foreheadCanvas.width=w;foreheadCanvas.height=h;
 paint(ref,reference,destination,1,0,foreheadCtx);
 // Keep the cheeks and lower face; gradually restore the original forehead.
 const browY=Math.min(destination[70].y,destination[300].y);
 const fadeStart=Math.max(0,browY-h*.12),fadeEnd=browY+h*.045;
 foreheadCtx.globalCompositeOperation='destination-in';
 const grad=foreheadCtx.createLinearGradient(0,fadeStart,0,fadeEnd);
 grad.addColorStop(0,'rgba(0,0,0,0)');
 grad.addColorStop(1,'rgba(0,0,0,1)');
 foreheadCtx.fillStyle=grad;foreheadCtx.fillRect(0,0,w,h);
 foreheadCtx.globalCompositeOperation='source-over';
 ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(foreheadCanvas,0,0);ctx.restore();
}
// Restrict repairs to expressions that failed visual QA. Approved expressions stay untouched.
const mouthRepairs=new Set(['full-smile.json','surprised.json','excited.json','smile.json','horny.json']);
const foreheadRepairs=new Set(['full-laugh.json','flush.json','thinking.json','horny.json']);

export function drawCalibratedFace(ctx:CanvasRenderingContext2D,original:HTMLImageElement,ref:HTMLImageElement,map:FaceMap,filename:string,settings:ExpressionPreset,expressionBlend=1,suppressExpressionMouth=false):DrawResult|null {if(!original.complete||!original.naturalWidth)return null;const m=map;const selection='/'+filename;const src=m.images.find(i=>i.role==='locked-original')?.landmarks, target=m.images.find(i=>i.role==='expression-reference')?.landmarks;if(!src||!target)return;
const w=original.naturalWidth,h=original.naturalHeight;ctx.canvas.width=w;ctx.canvas.height=h;ctx.drawImage(original,0,0);
const g=settings.geometry/100*expressionBlend,t=settings.texture/100*expressionBlend,f=settings.cheekWarmth/100*expressionBlend;


const sb=bounds(src),tb=bounds(target),ratioX=sb.w/Math.max(tb.w,.001),ratioY=sb.h/Math.max(tb.h,.001);
const source=src.map(p=>({x:p.x*w,y:p.y*h}));
const destination=src.map((p,i)=>{const q=target[i];const nx=sb.minX+(q.x-tb.minX)*ratioX,ny=sb.minY+(q.y-tb.minY)*ratioY;return {x:(p.x+(nx-p.x)*g)*w,y:(p.y+(ny-p.y)*g)*h};});
if(g){
 ctx.clearRect(0,0,w,h);ctx.drawImage(original,0,0);
 if(foreheadRepairs.has(selection.split('/').pop()||'')){
  // Warp the lower face as before, but fade the geometry to zero above the brows.
  // Preserve the original hairline and upper forehead; mouth rendering stays unchanged.
  const layer=document.createElement('canvas');layer.width=w;layer.height=h;
  const layerCtx=layer.getContext('2d')!;
  paint(original,source,destination,1,0,layerCtx);
  const browY=Math.min(destination[70].y,destination[300].y);
  const fadeStart=Math.max(0,browY-h*.13),fadeEnd=browY+h*.06;
  layerCtx.globalCompositeOperation='destination-in';
  const fade=layerCtx.createLinearGradient(0,fadeStart,0,fadeEnd);
  fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');
  layerCtx.fillStyle=fade;layerCtx.fillRect(0,0,w,h);
  layerCtx.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);
 }else paint(original,source,destination,1,selection.endsWith('/smile.json')?0.7:0,ctx);
}
// Embarrassed 2 reference contains a hand: use its landmarks for motion only.
// Do not transfer occluding hand pixels into the portrait.
if(t&&ref.complete&&ref.naturalWidth&&!selection.endsWith('/embarrassed2.json')){const reference=target.map(p=>({x:p.x*ref.naturalWidth,y:p.y*ref.naturalHeight}));if(foreheadRepairs.has(selection.split('/').pop()||''))paintFeatheredForeheadTexture(ctx,ref,reference,destination,t*.55,w,h);else paint(ref,reference,destination,t*.55,selection.endsWith('/smile.json')?0.7:0,ctx);// Historical fix 58c25b5: avoid a second expression-mouth repair layer when a speech mouth is active.
 if(!suppressExpressionMouth){
  if(selection.endsWith('/full-laugh.json')||mouthRepairs.has(selection.split('/').pop()||''))paintContinuousMouth(ctx,ref,reference,destination,expressionBlend,w,h);
  else paintMouth(ctx,ref,reference,destination,expressionBlend,w,h);
 }}
if(f){const cheeks=[src[205],src[425],src[50],src[280]];ctx.save();ctx.globalCompositeOperation='source-over';for(const p of cheeks){const x=p.x*w,y=p.y*h,r=w*.09;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(221,79,92,'+(f*.22)+')');grad.addColorStop(1,'rgba(221,79,92,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(x,y,r,r*.7,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
return {destination,width:w,height:h};
}
