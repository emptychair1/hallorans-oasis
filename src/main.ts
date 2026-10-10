import './style.css';
import { ConversationScene } from './world/ConversationScene';
import { OasisPiperVoice } from './OasisPiperVoice';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Halloran\'s Oasis mount point was not found.');
}

const oasis = new ConversationScene(mount);
const piperVoice = new OasisPiperVoice(level => oasis.setSpeechLevel(level), expression => oasis.setExpression(expression));
oasis.start();

const faceToggle = document.createElement('button');
faceToggle.type = 'button';
faceToggle.className = 'oasis-face-toggle';
faceToggle.textContent = 'FACE';
faceToggle.setAttribute('aria-label', 'Switch to face close-up');
faceToggle.addEventListener('click', () => {
  const face = oasis.toggleFaceCamera();
  document.body.classList.toggle('oasis-face-mode', face);
  faceToggle.textContent = face ? 'ROOM' : 'FACE';
  faceToggle.setAttribute('aria-pressed', String(face));
  faceToggle.setAttribute('aria-label', face ? 'Return to room view' : 'Switch to face close-up');
});
document.body.appendChild(faceToggle);
const realismToggle = document.createElement('button');
realismToggle.type = 'button';
realismToggle.className = 'oasis-realism-toggle';
realismToggle.textContent = 'CURRENT';
realismToggle.setAttribute('aria-pressed', 'false');
realismToggle.setAttribute('aria-label', 'Enable cinematic rendering');
realismToggle.addEventListener('click', () => {
  const cinematic = oasis.toggleCinematic();
  realismToggle.textContent = cinematic ? 'CINEMATIC' : 'CURRENT';
  realismToggle.setAttribute('aria-pressed', String(cinematic));
  realismToggle.setAttribute('aria-label', cinematic ? 'Restore current rendering' : 'Enable cinematic rendering');
});
document.body.appendChild(realismToggle);


window.addEventListener('pagehide', () => {
  faceToggle.remove();
  realismToggle.remove();
  piperVoice.dispose();
  oasis.dispose();
}, { once: true });
