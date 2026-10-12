import './style.css';
import { OasisPiperVoice } from './OasisPiperVoice';
const frame=document.querySelector<HTMLIFrameElement>('#portrait')!;
const expressionDiagnostic=document.createElement('div');
expressionDiagnostic.style.cssText='position:fixed;top:8px;left:8px;z-index:100002;background:#171717e8;color:#fff;padding:6px 9px;border:1px solid #9b8265;border-radius:6px;font:12px system-ui;pointer-events:none';
expressionDiagnostic.textContent='Expression · status: idle | selected: waiting | applied: neutral';
document.body.append(expressionDiagnostic);
let selectedExpression='waiting',appliedExpression='neutral',expressionStatus='idle';
const updateExpressionDiagnostic=()=>{expressionDiagnostic.textContent=`Expression · status: ${expressionStatus} | selected: ${selectedExpression} | applied: ${appliedExpression}`;};
window.addEventListener('oasis-expression-status',(event)=>{expressionStatus=(event as CustomEvent<{status:string}>).detail.status;updateExpressionDiagnostic();});
window.addEventListener('oasis-expression-selected',(event)=>{selectedExpression=(event as CustomEvent<{expression:string}>).detail.expression;updateExpressionDiagnostic();});
// Compact on-device transition log; no conversation text or audio is recorded.
const transitionPanel=document.createElement('details');
transitionPanel.style.cssText='position:fixed;top:92px;left:8px;z-index:100003;background:#171717ee;color:#fff;border:1px solid #9b8265;border-radius:6px;padding:5px 8px;font:11px system-ui;max-width:min(94vw,380px);max-height:38vh;overflow:auto';
transitionPanel.innerHTML='<summary style="cursor:pointer">Expression transitions (last 16)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0" aria-live="off"></pre>';
document.body.append(transitionPanel);
const transitionLines:string[]=[];
window.addEventListener('oasis-expression-transition',(event)=>{
 const item=(event as CustomEvent<{at:string;action:string;expression:string;reason:string;voiceState:string}>).detail;
 transitionLines.unshift(item.at+' ['+item.voiceState+'] '+item.action+' '+item.expression+' ('+item.reason+')');
 transitionLines.length=Math.min(16,transitionLines.length);
 transitionPanel.querySelector('pre')!.textContent=transitionLines.join('\\n');
});
const voice=new OasisPiperVoice(
 level=>frame.contentWindow?.postMessage({type:'piper-speech-level',level},location.origin),
 expression=>{appliedExpression=expression;updateExpressionDiagnostic();frame.contentWindow?.postMessage({type:'piper-expression',expression},location.origin);},
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
