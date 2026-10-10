type ChatMessage = { role: 'user' | 'assistant'; content: string };

export class OasisPiperChat {
  private readonly root = document.createElement('section');
  private readonly toggle = document.createElement('button');
  private readonly panel = document.createElement('div');
  private readonly transcript = document.createElement('div');
  private readonly form = document.createElement('form');
  private readonly input = document.createElement('textarea');
  private readonly send = document.createElement('button');
  private readonly status = document.createElement('p');
  private readonly messages: ChatMessage[] = [];
  private busy = false;
  private disposed = false;

  constructor() {
    this.root.className = 'oasis-piper';
    this.toggle.className = 'oasis-piper__toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = 'Talk to Piper';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-controls', 'oasis-piper-panel');

    this.panel.className = 'oasis-piper__panel';
    this.panel.id = 'oasis-piper-panel';
    this.panel.hidden = true;

    const heading = document.createElement('div');
    heading.className = 'oasis-piper__heading';
    const title = document.createElement('strong');
    title.textContent = 'Piper';
    const close = document.createElement('button');
    close.className = 'oasis-piper__close';
    close.type = 'button';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close Piper chat');
    heading.append(title, close);

    this.transcript.className = 'oasis-piper__transcript';
    this.transcript.setAttribute('role', 'log');
    this.transcript.setAttribute('aria-live', 'polite');
    this.transcript.setAttribute('aria-label', 'Conversation with Piper');

    this.status.className = 'oasis-piper__status';
    this.status.textContent = 'Connected through Piper Home';

    this.input.className = 'oasis-piper__input';
    this.input.rows = 2;
    this.input.maxLength = 12000;
    this.input.placeholder = 'Say something to Piper…';
    this.input.setAttribute('aria-label', 'Message Piper');

    this.send.className = 'oasis-piper__send';
    this.send.type = 'submit';
    this.send.textContent = 'Send';

    this.form.className = 'oasis-piper__form';
    this.form.append(this.input, this.send);
    this.panel.append(heading, this.transcript, this.status, this.form);
    this.root.append(this.toggle, this.panel);
    document.body.append(this.root);

    this.toggle.addEventListener('click', this.togglePanel);
    close.addEventListener('click', this.closePanel);
    this.form.addEventListener('submit', this.submit);
    this.input.addEventListener('keydown', this.keydown);
  }

  private togglePanel = (): void => {
    if (this.panel.hidden) this.openPanel();
    else this.closePanel();
  };

  private openPanel = (): void => {
    this.panel.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.textContent = 'Piper is here';
    this.input.focus({ preventScroll: true });
  };

  private closePanel = (): void => {
    this.panel.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.textContent = 'Talk to Piper';
  };

  private keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.form.requestSubmit();
    }
  };

  private appendMessage(role: ChatMessage['role'], content: string): HTMLDivElement {
    const bubble = document.createElement('div');
    bubble.className = `oasis-piper__message oasis-piper__message--${role}`;
    bubble.textContent = content;
    this.transcript.append(bubble);
    this.transcript.scrollTop = this.transcript.scrollHeight;
    return bubble;
  }

  private submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const text = this.input.value.trim();
    if (!text || this.busy || this.disposed) return;

    this.messages.push({ role: 'user', content: text });
    while (this.messages.length > 8) this.messages.shift();
    this.appendMessage('user', text);
    this.input.value = '';
    this.busy = true;
    this.send.disabled = true;
    this.status.textContent = 'Piper is thinking…';
    const replyBubble = this.appendMessage('assistant', '');

    try {
      const response = await fetch('/api/oasis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json' },
        body: JSON.stringify({
          messages: this.messages,
          current_session_messages: this.messages,
          session_context: 'home-ephemeral-session-v1',
          input_mode: 'text',
          stream: true,
          client_turn_id: crypto.randomUUID()
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail.trim() || `Piper Home returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let reply = '';
      if (contentType.includes('text/event-stream')) {
        if (!response.body) throw new Error('Piper Home returned an empty stream');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const packet = JSON.parse(data) as { response?: string; reply?: string; text?: string };
              reply += packet.response || packet.reply || packet.text || '';
              replyBubble.textContent = reply;
              this.transcript.scrollTop = this.transcript.scrollHeight;
            } catch {
              // Ignore non-JSON SSE keepalive/event lines.
            }
          }
          if (done) break;
        }
        if (pending.startsWith('data:')) {
          const data = pending.slice(5).trim();
          if (data && data !== '[DONE]') {
            try {
              const packet = JSON.parse(data) as { response?: string; reply?: string; text?: string };
              reply += packet.response || packet.reply || packet.text || '';
            } catch {
              // The stream ended with a non-JSON line.
            }
          }
        }
      } else {
        const payload = await response.json() as { reply?: string; response?: string; error?: string };
        if (payload.error) throw new Error(payload.error);
        reply = payload.reply || payload.response || '';
      }

      if (!reply.trim()) throw new Error('Piper Home returned no visible reply');
      replyBubble.textContent = reply;
      this.messages.push({ role: 'assistant', content: reply });
      while (this.messages.length > 8) this.messages.shift();
      this.status.textContent = 'Connected through Piper Home';
    } catch (error) {
      replyBubble.remove();
      this.status.textContent = error instanceof Error ? error.message : 'Could not reach Piper Home';
    } finally {
      this.busy = false;
      this.send.disabled = false;
      if (!this.disposed) this.input.focus({ preventScroll: true });
    }
  };

  dispose(): void {
    this.disposed = true;
    this.toggle.removeEventListener('click', this.togglePanel);
    this.form.removeEventListener('submit', this.submit);
    this.input.removeEventListener('keydown', this.keydown);
    this.root.remove();
  }
}
