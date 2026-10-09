import './style.css';
import { OasisScene } from './world/OasisScene';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Halloran\'s Oasis mount point was not found.');
}

const oasis = new OasisScene(mount);
oasis.start();

window.addEventListener('pagehide', () => oasis.dispose(), { once: true });
