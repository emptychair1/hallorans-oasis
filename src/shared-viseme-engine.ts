// Shared mouth deformation from the existing Viseme Lab (Bites 06, 14, 15).
// Keep all pixel and aperture formulas identical to the original.
export type MouthPoint={x:number;y:number};
export type MouthKey='leftCorner'|'rightCorner'|'upperInner'|'lowerInner'|'lowerCenter';
export type MouthCalibration=Record<MouthKey,MouthPoint>;
export const VISEME_AMOUNTS={rest:0,ah:.78,ee:.22,oo:.46,mbp:0} as const;
export type Viseme=keyof typeof VISEME_AMOUNTS;
export const shapeValue=(v:Viseme)=>v==='ee'?-.12:v==='oo'?.18:0;
export function warpCalibratedMouth(targetCtx:CanvasRenderingContext2D,pixelWidth:number,pixelHeight:number,imageWidth:number,imageHeight:number,points:MouthCalibration,opening:number,shapeBlend:number,mbpBlend:number,originX=0,originY=0,scale=1){
   const frame=targetCtx.getImageData(0,0,pixelWidth,pixelHeight);
   const src=new Uint8ClampedArray(frame.data);
   const left=points.leftCorner.x,right=points.rightCorner.x;
   const mouthMid=(left+right)/2;
   const halfWidth=(right-left)/2;
   const upper=points.upperInner.y;
   const lower=points.lowerInner.y;
   const shift=opening*.016;
   const sourceY=(y:number)=> (y*imageHeight-originY)*scale;
   const sourceX=(x:number)=> (x*imageWidth-originX)*scale;
   const minX=Math.max(0,Math.floor(sourceX(left-.045)));
   const maxX=Math.min(pixelWidth-1,Math.ceil(sourceX(right+.045)));
   const minY=Math.max(0,Math.floor(sourceY(upper-.012)));
   const maxY=Math.min(pixelHeight-1,Math.ceil(sourceY(points.lowerCenter.y+.085)));
   const smooth=(t:number)=>{const q=Math.max(0,Math.min(1,t));return q*q*(3-2*q);};
   for(let py=minY;py<=maxY;py++){
    const yn=((py/scale)+originY)/imageHeight;
    for(let px=minX;px<=maxX;px++){
     const xn=((px/scale)+originX)/imageWidth;
     const u=(xn-mouthMid)/halfWidth;
     const horizontal=1-smooth((Math.abs(u)-.72)/.58);
     if(horizontal<=0)continue;
     const below=smooth((yn-(upper-.007))/.022);
     const chinFade=1-smooth((yn-(points.lowerCenter.y+.012))/.07);
     const displacement=shift*horizontal*below*chinFade;
     // Experimental horizontal lip deformation for EE and OO.
     // Fade to zero at the cheek and above/below the lips.
     const lipVertical=smooth((yn-(upper-.035))/.035)*(1-smooth((yn-(points.lowerCenter.y+.012))/.045));
     const shape=shapeBlend;
     const xShift=shape*halfWidth*u*horizontal*lipVertical;
     const sx=Math.max(0,Math.min(pixelWidth-1,Math.round(px+xShift*imageWidth*scale)));
     // Bite 15: M/B/P must close without a discontinuous vertical pixel jump.
     // A smooth, tapered convergence replaces the old +/- offset that
     // produced a hard horizontal seam across the lips.
     const closureCenter=(upper+lower)/2;
     const closureDistance=(yn-closureCenter)/.012;
     const mbpOffset=.0018*mbpBlend*horizontal*lipVertical*
       (closureDistance/(1+closureDistance*closureDistance));
     const sy=Math.max(0,Math.min(pixelHeight-1,Math.round(py-(displacement+mbpOffset)*imageHeight*scale)));
     const dest=(py*pixelWidth+px)*4,from=(sy*pixelWidth+sx)*4;
     for(let ch=0;ch<3;ch++)frame.data[dest+ch]=src[from+ch];
     // A soft shadow between upper and displaced lower seam; no pointed polygon.
     // Bite 14: curved, tapered inner aperture instead of a horizontal dark band.
     // Restrict the opening to the central lip seam and feather every edge.
     const apertureU=u/.77;
     const arch=Math.sqrt(Math.max(0,1-apertureU*apertureU));
     const centerY=(upper+lower)/2+.001+displacement*.28;
     const halfHeight=(.0025+opening*.0105)*arch;
     const feather=.0022;
     const vertical=smooth((yn-(centerY-halfHeight))/feather)*
       (1-smooth((yn-(centerY+halfHeight-feather))/feather));
     const sideFade=1-smooth((Math.abs(apertureU)-.76)/.24);
     const dark=vertical*sideFade*opening*.76;
     if(dark>0){
      frame.data[dest]=Math.round(frame.data[dest]*(1-dark)+38*dark);
      frame.data[dest+1]=Math.round(frame.data[dest+1]*(1-dark)+19*dark);
      frame.data[dest+2]=Math.round(frame.data[dest+2]*(1-dark)+25*dark);
     }
    }
   }
   targetCtx.putImageData(frame,0,0);
}
