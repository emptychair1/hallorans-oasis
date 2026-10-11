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


// Fast local director: facial expressions must never wait on a second model call.
const EXPRESSION_CHOICES = ["wanting","thinking","surprised","smile2","smile","sad2","sad","neutral","mischievous","mad","horny","full-smile","full-laugh","flush","flirt","excited","embarrassed2"];
type ExpressionCue = {at:number;expression:string};
function expressionForText(text:string):string {
 const t=text.toLowerCase();
 const rules:[string,RegExp,number][]=[
  ['sad',/\b(sorry|grief|grieving|miss you|miss someone|lonely|heartbreak|heartbroken|sad|hurt|painful|lost someone|loss|crying|tears)\b/g,3],
  ['surprised',/\b(wow|what\?!|unbelievable|no way|shocked|surprised|unexpected|seriously\?|really\?!)\b/g,3],
  ['excited',/\b(amazing|wonderful|fantastic|incredible|excited|celebrate|congratulations|great news|so happy|thrilled)\b/g,3],
  ['full-laugh',/\b(hahaha|ahahaha|laughing|hilarious|cracking up)\b/g,4],
  ['thinking',/\b(think|thinking|consider|wonder|perhaps|maybe|question|interesting|complex|depends|possibility|reflect)\b/g,2],
  ['flirt',/\b(flirting|flirt|darling|sweetheart|kiss|blush)\b/g,2],
  ['smile',/\b(love|glad|happy|lovely|sweet|beautiful|proud|delighted|smile|good news|thank you)\b/g,2],
  ['mad',/\b(angry|furious|outrageous|infuriating|unacceptable)\b/g,3]
 ];
 let best='neutral',score=0;
 for(const [name,re,weight] of rules){const hits=t.match(re)?.length||0;const n=Math.min(3,hits)*weight;if(n>score){score=n;best=name;}}
 return best;
}
function directExpressionCues(reply:string,context:string):ExpressionCue[]{
 const parts=reply.match(/[^.!?\n]+[.!?]*/g)?.map(s=>s.trim()).filter(Boolean)||[reply];
 const total=parts.reduce((n,p)=>n+p.length,0)||1;
 let offset=0;
 const cues:ExpressionCue[]=[];
 for(const part of parts){const at=offset/total;const expression=expressionForText(part);if(!cues.length||cues[cues.length-1].expression!==expression){cues.push({at,expression});}offset+=part.length;}
 if(cues.length===1&&cues[0].expression==='neutral'){const fromContext=expressionForText(context);if(fromContext!=='neutral')cues[0].expression=fromContext;}
 const selected=cues.filter((cue,i)=>i===0||cue.expression!=='neutral'||i===cues.length-1).slice(0,4);
 if(!selected.length)return [{at:0,expression:'neutral'}];
 selected[0].at=0;
 return selected;
}
async function classifyExpression(request:Request):Promise<Response>{
 if(request.method!=='POST')return jsonError('Method not allowed',405);
 if(!sameOrigin(request))return jsonError('Same-origin request required',403);
 let body:{conversation?:unknown;reply?:unknown};
 try{const raw=await request.text();if(raw.length>16000)return jsonError('Too large',413);body=JSON.parse(raw);}catch{return jsonError('Invalid JSON',400);}
 const reply=typeof body.reply==='string'?body.reply.slice(0,2500):'';
 if(!reply)return jsonError('Reply required',400);
 const conversation=Array.isArray(body.conversation)?body.conversation.slice(-4).filter((m):m is {role:string;content:string}=>!!m&&typeof m==='object'&&typeof m.role==='string'&&typeof m.content==='string').map(m=>m.content.slice(0,500)).join(' '):'';
 const cues=directExpressionCues(reply,conversation);
 return Response.json({expression:cues[0].expression,cues,fallback:false,source:'local-director'},{headers:{'cache-control':'no-store'}});
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
