import './style.css';
import { ConversationScene } from './world/ConversationScene';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Halloran\'s Oasis mount point was not found.');
}

const oasis = new ConversationScene(mount);
oasis.start();

window.addEventListener('pagehide', () => oasis.dispose(), { once: true });
