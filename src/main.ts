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

window.addEventListener('pagehide', () => {
  faceToggle.remove();
  piperVoice.dispose();
  oasis.dispose();
}, { once: true });
