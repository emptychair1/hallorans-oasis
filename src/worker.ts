interface OasisEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const PIPER_HOME_ORIGIN = 'https://piper-home.daniels-joshua100.workers.dev';
const MAX_REQUEST_CHARS = 64_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: { 'cache-control': 'no-store' }
  });
}

function sameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  return request.headers.get('origin') === url.origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site';
}

async function proxyPiperChat(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonError('Method not allowed', 405);
  if (!sameOrigin(request)) return jsonError('Same-origin request required', 403);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_CHARS) return jsonError('Message payload is too large', 413);

  let raw: string;
  let body: Record<string, unknown>;
  try {
    raw = await request.text();
    if (raw.length > MAX_REQUEST_CHARS) return jsonError('Message payload is too large', 413);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const messages = Array.isArray(body.current_session_messages) && body.current_session_messages.length
    ? body.current_session_messages
    : Array.isArray(body.messages) ? body.messages : [];
  const safeMessages = messages
    .filter((item): item is { role: string; content: string } =>
      Boolean(item && typeof item === 'object' &&
        ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'assistant') &&
        typeof (item as { content?: unknown }).content === 'string'))
    .map(item => ({ role: item.role, content: item.content.trim().slice(0, 12_000) }))
    .filter(item => item.content)
    .slice(-8);
  if (!safeMessages.some(message => message.role === 'user')) return jsonError('A message is required', 400);

  try {
    const upstream = await fetch(PIPER_HOME_ORIGIN + '/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: request.headers.get('accept')?.includes('text/event-stream') ? 'text/event-stream' : 'application/json'
      },
      body: JSON.stringify({
        ...body,
        messages: safeMessages,
        current_session_messages: safeMessages,
        stream: body.stream === true
      }),
      redirect: 'follow'
    });
    const headers = new Headers({ 'cache-control': 'no-store', 'x-oasis-piper-bridge': 'piper-home-chat-v1' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    for (const name of [
      'x-piper-home-cutover', 'x-piper-resident-model', 'x-piper-resident-provider',
      'x-piper-resident-mode', 'x-piper-home-brain', 'x-piper-continuity-injected',
      'x-piper-continuity-version', 'x-piper-home-thinking'
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : error).slice(0, 240);
    return Response.json({ error: 'Piper Home could not be reached. Please try again.', detail }, {
      status: 502, headers: { 'cache-control': 'no-store', 'x-oasis-piper-bridge': 'piper-home-chat-v1' }
    });
  }
}

async function proxyVoice(request: Request, endpoint: 'piper-transcribe' | 'piper-speak-fast'): Promise<Response> {
  if (request.method !== 'POST') return jsonError('Method not allowed', 405);
  if (!sameOrigin(request)) return jsonError('Same-origin request required', 403);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  const maxBytes = endpoint === 'piper-transcribe' ? MAX_AUDIO_BYTES : MAX_REQUEST_CHARS;
  if (declaredLength > maxBytes) return jsonError('Voice payload is too large', 413);

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
    if (body.byteLength > maxBytes) return jsonError('Voice payload is too large', 413);
  } catch {
    return jsonError('Could not read voice payload', 400);
  }
  if (endpoint === 'piper-speak-fast') {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body)) as { text?: unknown };
      if (typeof parsed.text !== 'string' || !parsed.text.trim()) return jsonError('Text to speak is required', 400);
      if (parsed.text.length > 12_000) return jsonError('Text to speak is too long', 413);
    } catch {
      return jsonError('Invalid JSON body', 400);
    }
  }

  try {
    const upstream = await fetch(PIPER_HOME_ORIGIN + '/api/' + endpoint, {
      method: 'POST',
      headers: {
        'content-type': endpoint === 'piper-transcribe'
          ? request.headers.get('content-type') || 'audio/mp4'
          : 'application/json',
        accept: endpoint === 'piper-transcribe' ? 'application/json' : 'audio/*'
      },
      body,
      redirect: 'follow'
    });
    const headers = new Headers({ 'cache-control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : error).slice(0, 240);
    return Response.json({ error: 'Piper Home voice service could not be reached.', detail }, {
      status: 502, headers: { 'cache-control': 'no-store' }
    });
  }
}


const EXPRESSION_CHOICES = ["wanting","thinking","surprised","smile2","smile","sad2","sad","neutral","mischievous","mad","horny","full-smile","full-laugh","flush","flirt","excited","embarrassed2"];
async function classifyExpression(request:Request):Promise<Response>{
 if(request.method!=='POST')return jsonError('Method not allowed',405);
 if(!sameOrigin(request))return jsonError('Same-origin request required',403);
 let body:{conversation?:unknown;reply?:unknown};
 try{const raw=await request.text();if(raw.length>16000)return jsonError('Too large',413);body=JSON.parse(raw);}catch{return jsonError('Invalid JSON',400);}
 const reply=typeof body.reply==='string'?body.reply.slice(0,2500):'';
 const context=Array.isArray(body.conversation)?body.conversation.filter((m):m is {role:string;content:string}=>!!m&&typeof m==='object'&&typeof m.role==='string'&&typeof m.content==='string').slice(-6).map(m=>({role:m.role,content:m.content.slice(0,1000)})):[];
 if(!reply)return jsonError('Reply required',400);
 const instruction='You are a silent facial-expression director for a talking portrait. Infer the emotional intent of the assistant reply in the context of the conversation, not from keyword or emoji matching. Choose up to FOUR emotional beats across the assistant reply from: '+EXPRESSION_CHOICES.join(', ')+'. Split by meaningful phrase or sentence transitions, not every punctuation mark. Return ONLY compact JSON: {"cues":[{"at":0,"expression":"smile"},{"at":0.5,"expression":"thinking"}]}. The at value is a fraction from 0 to 1 of the spoken reply progression; first cue must be at 0, remaining cues increasing. Avoid needless switches. Prefer neutral if ambiguous.\nConversation: '+JSON.stringify(context)+'\nAssistant reply: '+JSON.stringify(reply);
 try{
  const upstream=await fetch(PIPER_HOME_ORIGIN+'/api/chat',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({messages:[{role:'user',content:instruction}],current_session_messages:[{role:'user',content:instruction}],session_context:'oasis-expression-classifier-v1',input_mode:'text',stream:false})});
  if(!upstream.ok)return Response.json({expression:'neutral',fallback:true},{headers:{'cache-control':'no-store'}});
  const result=await upstream.json() as {reply?:string;response?:string;text?:string};
  const raw=String(result.reply||result.response||result.text||'').trim();
  let cues:{at:number;expression:string}[]=[];
  try{const match=raw.match(/\\{[\\s\\S]*\\}/);const parsed=JSON.parse(match?.[0]||raw) as {cues?:unknown};if(Array.isArray(parsed.cues)){cues=parsed.cues.slice(0,4).filter((cue):cue is {at:number;expression:string}=>!!cue&&typeof cue.at==='number'&&Number.isFinite(cue.at)&&cue.at>=0&&cue.at<=1&&typeof cue.expression==='string'&&EXPRESSION_CHOICES.includes(cue.expression)).sort((a,b)=>a.at-b.at);}}catch{/* legacy single-expression fallback */}
  if(!cues.length){const single=raw.toLowerCase().replace(/[`"'*.]/g,'');cues=[{at:0,expression:EXPRESSION_CHOICES.includes(single)?single:'neutral'}];}
  if(cues[0].at!==0)cues.unshift({at:0,expression:cues[0].expression});
  return Response.json({expression:cues[0].expression,cues},{headers:{'cache-control':'no-store'}});
 }catch{return Response.json({expression:'neutral',fallback:true},{headers:{'cache-control':'no-store'}});}
}

export default {
  async fetch(request: Request, env: OasisEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/oasis/expression') return classifyExpression(request);
    if (url.pathname === '/api/oasis/chat') return proxyPiperChat(request);
    if (url.pathname === '/api/oasis/transcribe') return proxyVoice(request, 'piper-transcribe');
    if (url.pathname === '/api/oasis/speak-fast') return proxyVoice(request, 'piper-speak-fast');
    return env.ASSETS.fetch(request);
  }
};
