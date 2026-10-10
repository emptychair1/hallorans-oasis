import './style.css';
import { ConversationScene } from './world/ConversationScene';
import { OasisPiperVoice } from './OasisPiperVoice';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Halloran\'s Oasis mount point was not found.');
}

const oasis = new ConversationScene(mount);
const piperVoice = new OasisPiperVoice(level => oasis.setSpeechLevel(level));
oasis.start();

window.addEventListener('pagehide', () => {
  piperVoice.dispose();
  oasis.dispose();
}, { once: true });
