import './style.css';
import { OasisPiperVoice } from './OasisPiperVoice';
const frame=document.querySelector<HTMLIFrameElement>('#portrait')!;
const voice=new OasisPiperVoice(
 level=>frame.contentWindow?.postMessage({type:'piper-speech-level',level},location.origin),
 undefined,
 event=>frame.contentWindow?.postMessage({type:'piper-speech-timing',...event},location.origin)
);
window.addEventListener('pagehide',()=>voice.dispose(),{once:true});
