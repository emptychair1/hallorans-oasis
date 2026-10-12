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
    const headers = new Headers({ 'cache-control': 'no-store', 'x-oasis-piper-bridge': 'piper-home-chat-v1', 'x-oasis-expression-forwarded': body.oasis_expression === true ? '1' : '0', 'x-oasis-upstream-trace-present': upstream.headers.has('x-piper-oasis-expression-opt-in') ? '1' : '0' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    for (const name of [
      'x-piper-home-cutover', 'x-piper-resident-model', 'x-piper-resident-provider',
      'x-piper-resident-mode', 'x-piper-home-brain', 'x-piper-continuity-injected',
      'x-piper-continuity-version', 'x-piper-home-thinking',
      'x-piper-oasis-expression-opt-in', 'x-piper-oasis-model-wrapper', 'x-piper-oasis-instruction-applied',
      'x-piper-oasis-entrypoint', 'x-piper-oasis-nested-trace'
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
type ExpressionCue = {at:number;expression:string};
type Mood = 'neutral'|'thinking'|'surprised'|'excited'|'full-laugh'|'smile'|'full-smile'|'sad'|'sad2'|'mad'|'flirt'|'wanting'|'flush'|'horny'|'mischievous'|'embarrassed2'|'smile2';
const moodRules: {mood:Mood;pattern:RegExp;weight:number}[] = [
 {mood:'horny',pattern:/\b(aroused|turned on|desire you|want you badly|can't keep my hands off|sexual tension|heated|lust|intimate|seduc(?:e|ing|tion))\b/gi,weight:6},
 {mood:'wanting',pattern:/\b(longing|yearn(?:ing)?|craving|wish you were here|want to be close|miss your touch|need you close)\b/gi,weight:6},
 {mood:'flirt',pattern:/\b(flirt(?:ing|atious)?|teas(?:e|ing)|come closer|come here|kiss(?:ing)?|darling|sweetheart|baby|gutter|wink|date night|little black dress)\b/gi,weight:4},
 {mood:'flush',pattern:/\b(blush(?:ing)?|flustered|making me blush|cheeks (?:are )?(?:red|warm)|shy around you)\b/gi,weight:7},
 {mood:'mischievous',pattern:/\b(troublemaker|cheeky|dare you|caught you|naughty|playful|sly|wicked grin)\b/gi,weight:5},
 {mood:'embarrassed2',pattern:/\b(embarrassed|mortified|awkward|oops|caught me)\b/gi,weight:5},
 {mood:'sad',pattern:/\b(grief|grieving|heartbroken|sad|lonely|loss|crying|tears|mourning|devastated)\b/gi,weight:6},
 {mood:'sad2',pattern:/\b(i'm sorry|that hurts|miss someone|painful|hard time)\b/gi,weight:5},
 {mood:'mad',pattern:/\b(furious|angry|outrageous|infuriating|unacceptable)\b/gi,weight:6},
 {mood:'surprised',pattern:/\b(wow|unbelievable|no way|shocked|surprised|unexpected|what a surprise)\b/gi,weight:5},
 {mood:'excited',pattern:/\b(amazing|wonderful|fantastic|incredible|excited|celebrate|congratulations|thrilled|great news)\b/gi,weight:5},
 {mood:'full-laugh',pattern:/\b(hahaha|ahahaha|hilarious|cracking up|burst out laughing)\b/gi,weight:6},
 {mood:'full-smile',pattern:/\b(so happy|overjoyed|delighted|beaming|big smile)\b/gi,weight:5},
 {mood:'smile',pattern:/\b(love|glad|happy|lovely|sweet|beautiful|proud|thank you|smile)\b/gi,weight:3},
 {mood:'thinking',pattern:/\b(let me think|consider the possibilities|on the other hand|it depends|complex question|perhaps|reasoning|analyze|reflect on)\b/gi,weight:4}
];
function moodScores(text:string):Map<Mood,number>{
 const scores=new Map<Mood,number>();
 for(const rule of moodRules){const hits=text.match(rule.pattern)?.length||0;if(hits)scores.set(rule.mood,(scores.get(rule.mood)||0)+Math.min(3,hits)*rule.weight);}
 return scores;
}
function strongestMood(scores:Map<Mood,number>,fallback:Mood='neutral'):Mood{
 let best=fallback,top=0;
 for(const [mood,score] of scores){if(score>top){best=mood;top=score;}}
 return best;
}
function directExpressionCues(reply:string,context:string):ExpressionCue[]{
 const recent=context.slice(-1300);
 const contextScores=moodScores(recent);
 const replyScores=moodScores(reply);
 // A sustained relational tone can guide ambiguous sentences, but the reply remains primary.
 const romantic:Mood[]=['flirt','wanting','flush','horny','mischievous'];
 const romanticContext=strongestMood(new Map([...contextScores].filter(([m])=>romantic.includes(m))));
 const primary=strongestMood(replyScores,romanticContext==='neutral'?'neutral':romanticContext);
 const parts=reply.match(/[^.!?\n]+[.!?]*/g)?.map(x=>x.trim()).filter(Boolean)||[reply];
 const total=parts.reduce((n,p)=>n+p.length,0)||1;
 let offset=0;
 const cues:ExpressionCue[]=[];
 for(const part of parts){
  const scores=moodScores(part);
  let mood=strongestMood(scores,primary);
  // Common affectionate words must not override a stronger romantic or emotional scene.
  if(romantic.includes(primary)&&['smile','thinking','neutral'].includes(mood))mood=primary;
  const at=offset/total;
  if(!cues.length||cues[cues.length-1].expression!==mood)cues.push({at,expression:mood});
  offset+=part.length;
 }
 // Keep the opening beat and up to three meaningful changes; don't reset on empty sentences.
 const selected=cues.filter((cue,i)=>i===0||cue.expression!=='neutral').slice(0,4);
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
