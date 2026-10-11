import './style.css';
import { OasisPiperVoice } from './OasisPiperVoice';
const frame=document.querySelector<HTMLIFrameElement>('#portrait')!;
const voice=new OasisPiperVoice(
 level=>frame.contentWindow?.postMessage({type:'piper-speech-level',level},location.origin),
 undefined,
 shape=>frame.contentWindow?.postMessage({type:'piper-viseme',shape},location.origin),
 event=>frame.contentWindow?.postMessage({...event,type:'piper-speech-timing'},location.origin)
);
window.addEventListener('pagehide',()=>voice.dispose(),{once:true});
