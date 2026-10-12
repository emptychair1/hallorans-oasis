import { LighterSync } from 'lighter-sync';
type VoiceMessage = { role: 'user' | 'assistant'; content: string };
type VoiceState = 'idle' | 'opening' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

const SESSION_CONTEXT = 'home-ephemeral-session-v1';
const VOICE_STYLE = 'Voice mode: speak naturally in plain spoken sentences. Do not write stage directions, asterisk actions, facial-expression narration, emoji, or emoji names. Convey emotion through your words, not descriptions of gestures.';
function spokenText(reply:string):string {
 return reply
  .replace(/\*\*[^*\n]{1,160}\*\*/g,' ')
  .replace(/\*[^*\n]{1,120}\*/g,' ')
  .replace(/(?:^|[.!?]\s+)(?:laughing|sparkling eyes|eyes wide|smiling|grinning|blushing|gasping|sighing)(?=\s*[.!?]|$)/gi,' ')
  .replace(/\[[^\]\n]{1,100}(?:smil|laugh|wink|blush|nod|sigh|gasp|expression|emoji)[^\]\n]*\]/gi,' ')
  .replace(/:[a-z][a-z0-9_+-]{2,40}:/gi,' ')
  .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu,'')
  .replace(/\s+([,.!?;:])/g,'$1').replace(/\s+/g,' ').trim();
}

export class OasisPiperVoice {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly status = document.createElement('p');
  private wanted = false;
  private disposed = false;
  private busy = false;
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private raf = 0;
  private activeSource: AudioBufferSourceNode | null = null;
  private speechAnalyser: AnalyserNode | null = null;
  private speechFrame = 0;
  private speechLevel = 0;
  private readonly messages: VoiceMessage[] = [];
  public lipOffset = 0;
  public lipHold = 45;
  private lastLip = '';
  private lastLipAt = 0;

  constructor(
    private readonly onSpeechLevel: (level: number) => void = () => {},
    private readonly onExpression: (expression: string) => void = () => {},
    private readonly onViseme: (shape: string) => void = () => {},
    private readonly onSpeechTiming: (event: {type:'start';text:string;duration:number}|{type:'frame';elapsed:number;level:number}|{type:'stop'}) => void = () => {}
  ) {
    this.root.className = 'oasis-voice';
    this.button.className = 'oasis-voice__button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Start talking with Piper');
    this.button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4m-4 0h8"/></svg>';
    this.status.className = 'oasis-voice__status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = 'Tap to talk to Piper';
    this.root.append(this.button, this.status);
    document.body.append(this.root);
    this.button.addEventListener('click', this.toggle);
    document.addEventListener('visibilitychange', this.visibilityChange);
    window.addEventListener('pagehide', this.dispose, { once: true });
  }

  private setState(state: VoiceState, message: string): void {
    this.root.dataset.state = state;
    this.status.textContent = message;
    const label = state === 'listening' ? 'Listening. Tap to pause Piper'
      : state === 'speaking' ? 'Piper is speaking. Tap to stop'
      : state === 'opening' ? 'Opening microphone. Tap to cancel'
      : state === 'transcribing' ? 'Understanding you. Tap to cancel'
      : state === 'thinking' ? 'Piper is thinking. Tap to cancel'
      : state === 'error' ? 'Voice needs attention. Tap to retry'
      : 'Start talking with Piper';
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
  }

  private toggle = (): void => {
    if (this.wanted) {
      this.stop('Voice paused. Tap when you want to talk again.');
      return;
    }
    void this.start();
  };

  private async start(): Promise<void> {
    if (this.disposed || this.wanted) return;
    this.wanted = true;
    const generation = ++this.generation;
    this.setState('opening', 'Opening microphone…');
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Voice recording is not supported in this browser.');
      }
      const context = new AudioContextClass();
      this.context = context;
      await context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      if (!this.wanted || generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        await context.close();
        return;
      }
      this.stream = stream;
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      this.listen(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.wanted = false;
      this.cleanupAudio();
      this.setState('error', error instanceof Error ? error.message : 'Could not open microphone.');
    }
  }

  private listen(generation: number): void {
    if (!this.wanted || generation !== this.generation || this.busy || !this.stream || !this.analyser) return;
    const started = performance.now();
    const chunks: BlobPart[] = [];
    let heardSpeech = false;
    let lastVoice = started;
    const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
    } catch {
      this.stop('This browser could not start microphone recording.');
      return;
    }
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => {
      if (generation === this.generation && this.wanted) this.stop('Microphone recording failed. Tap to retry.');
    };
    recorder.onstop = () => {
      if (this.recorder === recorder) this.recorder = null;
      cancelAnimationFrame(this.raf);
      if (!this.wanted || generation !== this.generation) return;
      if (!heardSpeech) {
        this.listen(generation);
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
      void this.handleUtterance(blob, generation);
    };
    try {
      recorder.start(100);
    } catch {
      this.stop('Microphone recording could not start.');
      return;
    }
    this.setState('listening', 'I’m listening. Speak naturally, then pause.');
    const watch = (): void => {
      if (!this.wanted || generation !== this.generation || this.recorder !== recorder || recorder.state !== 'recording' || !this.analyser) return;
      const samples = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(samples);
      const level = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
      const now = performance.now();
      if (level > 0.035) {
        heardSpeech = true;
        lastVoice = now;
      }
      if ((heardSpeech && now - lastVoice >= 700 && now - started >= 800) || now - started >= 18000) {
        recorder.stop();
        return;
      }
      this.raf = requestAnimationFrame(watch);
    };
    this.raf = requestAnimationFrame(watch);
  }

  private async handleUtterance(blob: Blob, generation: number): Promise<void> {
    if (!this.wanted || generation !== this.generation) return;
    this.busy = true;
    try {
      this.setState('transcribing', 'Understanding you…');
      const transcribe = await fetch('/api/oasis/transcribe', {
        method: 'POST',
        headers: { 'content-type': blob.type || 'audio/mp4' },
        body: blob
      });
      if (!transcribe.ok) throw new Error(await this.errorFrom(transcribe));
      const transcript = String((await transcribe.json() as { text?: string }).text || '').trim();
      if (!transcript) {
        this.busy = false;
        this.listen(generation);
        return;
      }

      this.setState('thinking', 'Piper is thinking…');
      const current = [...this.messages, { role: 'user' as const, content: transcript }].slice(-8);
      const voiceMessages = [{role:'system',content:VOICE_STYLE},...current];
      const response = await fetch('/api/oasis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json' },
        body: JSON.stringify({
          messages: voiceMessages,
          current_session_messages: current,
          session_context: SESSION_CONTEXT,
          input_mode: 'voice',
          stream: true,
          oasis_expression: true,
          client_turn_id: crypto.randomUUID()
        })
      });
      if (!response.ok) throw new Error(await this.errorFrom(response));
      const rawReply = await this.readReply(response);
      const expressionMatch = rawReply.match(/\[\[OASIS_EXPRESSION:([a-z0-9-]+):([01](?:\.\d+)?)\]\]/i);
      const approvedModelExpressions = new Set(['neutral','wanting','thinking','surprised','smile2','smile','sad2','sad','mischievous','mad','horny','full-smile','full-laugh','flush','flirt','excited','embarrassed2']);
      const modelExpression = expressionMatch && approvedModelExpressions.has(expressionMatch[1].toLowerCase()) && Number(expressionMatch[2]) <= 1 ? expressionMatch[1].toLowerCase() : null;
      const reply = rawReply.replace(/\[\[OASIS_EXPRESSION:[^\]\r\n]*\]\]/gi,'').trim();
      if (!reply.trim()) throw new Error('Piper Home returned no reply.');
      if (!this.wanted || generation !== this.generation) return;
      this.messages.push({ role: 'user', content: transcript }, { role: 'assistant', content: reply });
      while (this.messages.length > 8) this.messages.shift();

      // A separate model decision interprets the dialogue, never the TTS string.
      type ExpressionCue={at:number;expression:string};
      const reportExpression=(status:string)=>{if(this.wanted&&generation===this.generation)window.dispatchEvent(new CustomEvent('oasis-expression-status',{detail:{status}}));};
      const optInTrace = response.headers.get('x-piper-oasis-expression-opt-in');
      const wrapperTrace = response.headers.get('x-piper-oasis-model-wrapper');
      reportExpression(modelExpression ? 'model-native' : expressionMatch ? 'invalid metadata · fallback' : 'missing metadata · fallback' + (optInTrace !== null ? ' · opt-in=' + optInTrace : ' · opt-in unverified') + (wrapperTrace !== null ? ' · model=' + wrapperTrace : ' · model unverified'));

      const expressionDecision:Promise<ExpressionCue[]>=modelExpression
        ? Promise.resolve([{at:0,expression:modelExpression}])
        : fetch('/api/oasis/expression',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversation:current,reply})})
        .then(async response=>{if(!response.ok){reportExpression('HTTP '+response.status);return [{at:0,expression:'neutral'}];}const data=await response.json() as {expression?:string;cues?:ExpressionCue[];fallback?:boolean;reason?:string};if(!modelExpression)reportExpression((data.fallback?'local fallback: '+(data.reason||'unknown'):'local director') + ' · ' + (expressionMatch?'invalid model metadata':'missing model metadata') + ' · opt-in=' + (optInTrace ?? '?') + ' · wrapper=' + (wrapperTrace ?? '?'));return Array.isArray(data.cues)&&data.cues.length?data.cues:[{at:0,expression:data.expression||'neutral'}];})
        .catch((error:unknown)=>{reportExpression('request error: '+(error instanceof Error?error.message:'unknown'));return [{at:0,expression:'neutral'}];});
      void expressionDecision.then(cues=>{if(this.wanted&&generation===this.generation)window.dispatchEvent(new CustomEvent('oasis-expression-selected',{detail:{expression:cues.map(c=>c.expression).join(' → ')}}));});
      const spoken = spokenText(reply) || 'I am here with you.';
      this.onExpression('neutral');
      this.setState('speaking', 'Piper is speaking…');
      const speech = await fetch('/api/oasis/speak-fast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/*' },
        body: JSON.stringify({ text: spoken })
      });
      if (!speech.ok) throw new Error(await this.errorFrom(speech));
      const bytes = await speech.arrayBuffer();
      if (!this.wanted || generation !== this.generation || !this.context) return;
      const audioBuffer = await this.context.decodeAudioData(bytes);
      if (!this.wanted || generation !== this.generation || !this.context) return;
      let alignment: LighterSync | null = null;
      try {
        const candidate = new LighterSync({mode:'simple'});
        await candidate.prepare(audioBuffer, spoken);
        if(candidate.keyframes.length) { alignment=candidate; console.info('[BITE 08D] LighterSync keyframes',candidate.keyframes.slice(0,20)); }
      } catch(error) { console.warn('LighterSync unavailable, using audio fallback',error); }
      if (!this.wanted || generation !== this.generation || !this.context) return;
      const source = this.context.createBufferSource();
      this.activeSource = source;
      source.buffer = audioBuffer;
      const speechAnalyser = this.context.createAnalyser();
      speechAnalyser.fftSize = 1024;
      this.speechAnalyser = speechAnalyser;
      source.connect(speechAnalyser);
      speechAnalyser.connect(this.context.destination);
      const samples = new Float32Array(speechAnalyser.fftSize);
      const spectrum = new Uint8Array(speechAnalyser.frequencyBinCount);
      let speechStartedAt=0;
      // Preserve expressive beats long enough to read on the portrait.
      let expressionCues:ExpressionCue[]=[];
      let nextExpressionCue=0;
      let currentExpression='neutral';
      let expressionBeganAt=0;
      const expressiveHold=(expression:string)=>['flirt','wanting','flush','horny','mischievous'].includes(expression)?3.2:expression==='neutral'?0:1.5;
      const applyExpression=(expression:string,elapsed:number)=>{
        if(expression===currentExpression)return;
        currentExpression=expression;
        expressionBeganAt=elapsed;
        this.onExpression(expression);
      };
      const advanceExpression=(elapsed:number)=>{
        while(nextExpressionCue<expressionCues.length){
          const cue=expressionCues[nextExpressionCue];
          if(elapsed<cue.at*audioBuffer.duration)break;
          if(elapsed-expressionBeganAt<expressiveHold(currentExpression))break;
          nextExpressionCue++;
          // Don't erase an emotional beat with a neutral filler cue.
          if(cue.expression==='neutral'&&currentExpression!=='neutral')continue;
          applyExpression(cue.expression,elapsed);
        }
      };
      void expressionDecision.then(cues=>{
        if(!this.wanted||generation!==this.generation||this.activeSource!==source)return;
        expressionCues=cues.filter(cue=>Number.isFinite(cue.at)&&typeof cue.expression==='string').sort((a,b)=>a.at-b.at);
        advanceExpression(Math.max(0,(this.context?.currentTime||0)-speechStartedAt));
      });
      const animateSpeech = () => {
        if (this.activeSource !== source || !this.wanted || generation !== this.generation) return;
        speechAnalyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        const target = Math.min(1, Math.max(0, (rms - 0.012) * 8));
        this.speechLevel += (target - this.speechLevel) * (target > this.speechLevel ? 0.45 : 0.22);
        this.onSpeechLevel(this.speechLevel);
        speechAnalyser.getByteFrequencyData(spectrum);
        const slice=(a:number,b:number)=>{let sum=0;for(let i=a;i<b;i++)sum+=spectrum[i];return sum/(b-a);};
        const low=slice(4,14),mid=slice(14,40),high=slice(40,90),hiss=slice(90,160);
        const shape=rms<.012?'rest':hiss>high*1.5?'fv':high>low*1.3?'ee':low>mid*1.4?'oo':mid>low*.85?'ah':'mbp';
        if(alignment){
          const cue=alignment.getFrame(Math.max(0,(this.context?.currentTime||0)-speechStartedAt+this.lipOffset)).visemeId;
          const mapped: string = ({SILENT:'rest',CLOSED:'mbp',FRICATIVE:'fv',ROUND:'oo',OPEN:'ah',WIDE:'ee'} as Record<string,string>)[cue] ?? (rms > .018 ? shape : 'rest');
          const now=performance.now();
          if(mapped!==this.lastLip&&(mapped==='rest'||now-this.lastLipAt>=this.lipHold)){
            this.lastLip=mapped;this.lastLipAt=now;this.onViseme(mapped);
          }
        }else this.onViseme(shape);
        const elapsed=Math.max(0,(this.context?.currentTime||0)-speechStartedAt);
        advanceExpression(elapsed);
        this.onSpeechTiming({type:'frame',elapsed,level:this.speechLevel});
        this.speechFrame = requestAnimationFrame(animateSpeech);
      };
      source.onended = () => {
        if (this.activeSource === source) {
          this.activeSource = null;
          this.onSpeechTiming({type:'stop'});
          this.resetSpeechAnimation();
          // Hold the final emotional beat through the listening pause; the next turn resets it.
        }
        if (this.wanted && generation === this.generation) {
          this.busy = false;
          this.listen(generation);
        }
      };
      speechStartedAt=this.context.currentTime;
      this.onSpeechTiming({type:'start',text:spoken,duration:audioBuffer.duration});
      source.start();
      this.speechFrame = requestAnimationFrame(animateSpeech);
    } catch (error) {
      if (this.wanted && generation === this.generation) {
        this.setState('error', error instanceof Error ? error.message : 'Voice conversation failed. Tap to retry.');
        this.wanted = false;
        this.cleanupAudio();
      }
    } finally {
      if (!this.activeSource) this.busy = false;
    }
  }

  private async readReply(response: Response): Promise<string> {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/event-stream')) {
      const data = await response.json() as { reply?: string; response?: string; error?: string };
      if (data.error) throw new Error(data.error);
      return String(data.reply || data.response || '');
    }
    if (!response.body) throw new Error('Piper Home returned an empty stream.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let reply = '';

    const consume = (line: string): void => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      const packet = JSON.parse(data) as {
        response?: string;
        reply?: string;
        text?: string;
        choices?: Array<{ delta?: { content?: string } }>;
        error?: string;
      };
      if (packet.error) throw new Error(packet.error);
      reply += packet.response ?? packet.reply ?? packet.text ?? packet.choices?.[0]?.delta?.content ?? '';
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) consume(line);
        if (done) {
          if (pending) consume(pending);
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return reply;
  }
  private async errorFrom(response: Response): Promise<string> {
    const text = await response.text().catch(() => '');
    try {
      const data = JSON.parse(text) as { error?: string; detail?: string };
      return [data.error, data.detail].filter(Boolean).join(' ') || 'Voice request failed (HTTP ' + response.status + ').';
    } catch {
      return text.slice(0, 240) || 'Voice request failed (HTTP ' + response.status + ').';
    }
  }

  private visibilityChange = (): void => {
    if (document.hidden && this.wanted) this.stop('Voice paused while Oasis is in the background.');
  };

  private stop(message: string): void {
    this.wanted = false;
    this.generation++;
    this.busy = false;
    cancelAnimationFrame(this.raf);
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.ondataavailable = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    }
    try { this.activeSource?.stop(); } catch {}
    this.activeSource = null;
    this.cleanupAudio();
    this.setState('idle', message);
  }

  private resetSpeechAnimation(): void {
    cancelAnimationFrame(this.speechFrame);
    this.speechFrame = 0;
    this.speechLevel = 0;
    this.onSpeechLevel(0);
    this.onViseme('rest');
    this.onSpeechTiming({type:'stop'});
    this.onExpression('neutral');
    try { this.speechAnalyser?.disconnect(); } catch {}
    this.speechAnalyser = null;
  }

  private cleanupAudio(): void {
    this.resetSpeechAnimation();
    try { this.source?.disconnect(); this.analyser?.disconnect(); } catch {}
    this.source = null;
    this.analyser = null;
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.stop('Voice disconnected.');
    this.button.removeEventListener('click', this.toggle);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.root.remove();
  };
}
