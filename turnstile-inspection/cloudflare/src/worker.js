const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin || origin === env.ALLOWED_ORIGIN) {
    return {
      'access-control-allow-origin': origin || env.ALLOWED_ORIGIN || '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'vary': 'Origin'
    };
  }
  return {};
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function routeParts(url) {
  return new URL(url).pathname.split('/').filter(Boolean);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = routeParts(request.url);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const d1 = await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: d1?.ok === 1, service: 'turnstile-inspection-api' });
  }

  // The concrete auth, inspection, assignment, history, push and document
  // endpoints are implemented next. Keeping unsupported routes explicit here
  // prevents accidental public write access while the backend is being built.
  if (parts[0] === 'api') {
    return json({ error: 'not_implemented' }, 501);
  }

  return json({ error: 'not_found' }, 404);
}

export class InspectionRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'websocket_required' }, 426);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sessions.add(server);

    server.addEventListener('close', () => this.sessions.delete(server));
    server.addEventListener('error', () => this.sessions.delete(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const socket of [...this.sessions]) {
      try {
        socket.send(payload);
      } catch {
        this.sessions.delete(socket);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      const response = await handleApi(request, env);
      return withCors(response, request, env);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: 'internal_error' }, 500), request, env);
    }
  }
};
