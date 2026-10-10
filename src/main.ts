import './style.css';
import { OasisPiperVoice } from './OasisPiperVoice';

// Portrait-only Oasis. Keep the existing Home-backed voice pipeline unchanged.
// The previous 3D scene remains in the repository but is not initialized.
const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error("Halloran's Oasis mount point was not found.");

document.body.classList.add('oasis-portrait-mode');
mount.setAttribute('aria-label', 'Piper portrait conversation');
const portrait = document.createElement('img');
portrait.className = 'oasis-portrait-image';
portrait.src = '/IMG_4604.jpeg';
portrait.alt = 'Piper';
portrait.decoding = 'async';
portrait.addEventListener('error', () => {
  mount.dataset.portraitMissing = 'true';
  const note = document.createElement('p');
  note.className = 'oasis-portrait-error';
  note.textContent = 'Piper portrait asset is not installed yet.';
  mount.append(note);
}, { once: true });
mount.append(portrait);

// Keep microphone, transcription, Piper Home chat and speech playback exactly as-is.
const piperVoice = new OasisPiperVoice();
window.addEventListener('pagehide', () => piperVoice.dispose(), { once: true });
