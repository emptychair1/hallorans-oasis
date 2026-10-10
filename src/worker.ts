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

export default {
  async fetch(request: Request, env: OasisEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/oasis/chat') return proxyPiperChat(request);
    if (url.pathname === '/api/oasis/transcribe') return proxyVoice(request, 'piper-transcribe');
    if (url.pathname === '/api/oasis/speak-fast') return proxyVoice(request, 'piper-speak-fast');
    return env.ASSETS.fetch(request);
  }
};
