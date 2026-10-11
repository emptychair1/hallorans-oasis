import './style.css';
import { OasisPiperVoice } from './OasisPiperVoice';
const frame=document.querySelector<HTMLIFrameElement>('#portrait')!;
const voice=new OasisPiperVoice(
 level=>frame.contentWindow?.postMessage({type:'piper-speech-level',level},location.origin),
 expression=>frame.contentWindow?.postMessage({type:'piper-expression',expression},location.origin),
 shape=>frame.contentWindow?.postMessage({type:'piper-viseme',shape},location.origin),
 event=>frame.contentWindow?.postMessage({...event,type:'piper-speech-timing'},location.origin)
);
window.addEventListener('pagehide',()=>voice.dispose(),{once:true});


const panel=document.createElement('details');
panel.style.cssText='position:fixed;top:45px;right:8px;z-index:100000;background:#171717;color:white;padding:12px;border:1px solid #9b8265;border-radius:8px;font:13px system-ui;width:190px';
panel.innerHTML='<summary style="cursor:pointer">Mouth tuning</summary><p>Timing: <output id="offset">0 ms</output></p><input id="timing" aria-label="Timing" type="range" min="-250" max="250" step="25" value="0" style="width:100%"><p>Smoothing: <output id="hold">45 ms</output></p><input id="smooth" aria-label="Smoothing" type="range" min="0" max="250" step="10" value="45" style="width:100%"><p><button id="reset" type="button">Reset</button></p>';
document.body.append(panel);
const timing=panel.querySelector<HTMLInputElement>('#timing')!;
const smooth=panel.querySelector<HTMLInputElement>('#smooth')!;
const refresh=()=>{
 voice.lipOffset=Number(timing.value)/1000;
 voice.lipHold=Number(smooth.value);
 panel.querySelector<HTMLOutputElement>('#offset')!.textContent=timing.value+' ms';
 panel.querySelector<HTMLOutputElement>('#hold')!.textContent=smooth.value+' ms';
};
timing.addEventListener('input',refresh);
smooth.addEventListener('input',refresh);
panel.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click',()=>{timing.value='0';smooth.value='45';refresh();});

const expressionControls=document.createElement('div');
expressionControls.style.cssText='position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);left:50%;transform:translateX(-50%);z-index:100001;display:flex;gap:8px';
expressionControls.innerHTML='<button type="button" data-expression="neutral">Neutral</button><button type="button" data-expression="smile">Smile</button>';
document.body.append(expressionControls);
expressionControls.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.addEventListener('click',()=>{
 frame.contentWindow?.postMessage({type:'piper-expression',expression:button.dataset.expression},location.origin);
}));
