import './style.css';
import { ConversationScene } from './world/ConversationScene';
import { OasisPiperChat } from './OasisPiperChat';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Halloran\'s Oasis mount point was not found.');
}

const oasis = new ConversationScene(mount);
const piperChat = new OasisPiperChat();
oasis.start();

window.addEventListener('pagehide', () => {
  piperChat.dispose();
  oasis.dispose();
}, { once: true });
