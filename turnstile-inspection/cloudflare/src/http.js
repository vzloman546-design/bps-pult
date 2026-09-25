export class HttpError extends Error {
  constructor(status, code, detail = '') {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function routeParts(url) {
  return new URL(url).pathname.split('/').filter(Boolean);
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const allowOrigin = !origin
    ? (allowed[0] || '*')
    : (allowed.includes(origin) ? origin : '');

  if (!allowOrigin) return {};

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'vary': 'Origin'
  };
}

export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
