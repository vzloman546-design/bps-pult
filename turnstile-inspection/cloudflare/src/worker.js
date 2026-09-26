import { HttpError, corsHeaders, json, routeParts, withCors } from './http.js';
import { requireUser, safeUser } from './auth.js';
import {
  handleAuthRoutes,
  handleBootstrapRoutes,
  handleHistoryRoute,
  handleNotificationRoutes,
  handlePushRoutes,
  handleUserRoutes
} from './routes-core.js';
import { handleInspectionRoutes } from './routes-inspections.js';
import { canAccessInspection } from './inspection-service.js';
import { generatePendingDocument } from './document-generator.js';

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = routeParts(request.url);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const d1 = await env.DB.prepare('SELECT 1 AS ok').first();
    return json({
      ok: d1?.ok === 1,
      service: 'turnstile-inspection-api',
      version: 1
    });
  }

  if (parts[0] !== 'api') throw new HttpError(404, 'not_found');

  if (parts[1] === 'bootstrap') {
    return handleBootstrapRoutes(request, env, parts.slice(1));
  }

  if (parts[1] === 'auth') {
    return handleAuthRoutes(request, env, parts.slice(1));
  }

  if (
    parts[1] === 'inspections' &&
    parts[3] === 'realtime' &&
    request.headers.get('Upgrade') === 'websocket'
  ) {
    const user = await requireUser(request, env, { websocket: true });
    const inspectionId = Number(parts[2]);
    if (!Number.isInteger(inspectionId)) throw new HttpError(404, 'inspection_not_found');
    if (!(await canAccessInspection(env, user, inspectionId))) {
      throw new HttpError(403, 'inspection_forbidden');
    }

    const objectId = env.INSPECTION_ROOM.idFromName(String(inspectionId));
    const stub = env.INSPECTION_ROOM.get(objectId);
    return stub.fetch(request);
  }

  const user = await requireUser(request, env);

  if (parts[1] === 'me') {
    if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
    return json({ user: safeUser(user) });
  }

  if (parts[1] === 'users') {
    return handleUserRoutes(request, env, parts, user);
  }

  if (parts[1] === 'inspections') {
    return handleInspectionRoutes(request, env, parts, user);
  }

  if (parts[1] === 'history') {
    return handleHistoryRoute(request, env, user);
  }

  if (parts[1] === 'notifications') {
    return handleNotificationRoutes(request, env, parts, user);
  }

  if (parts[1] === 'push') {
    return handlePushRoutes(request, env, parts.slice(1), user);
  }

  throw new HttpError(404, 'not_found');
}

export class InspectionRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const event = await request.json();

      if (
        event?.type === 'inspection_completed' &&
        Number.isInteger(Number(event.inspectionId)) &&
        Number.isInteger(Number(event.documentVersion))
      ) {
        await this.state.storage.put('pendingDocument', {
          inspectionId: Number(event.inspectionId),
          version: Number(event.documentVersion)
        });
        await this.state.storage.setAlarm(Date.now() + 1000);
      }

      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(JSON.stringify(event));
        } catch {
          try { socket.close(1011, 'send_failed'); } catch {}
        }
      }

      return json({ ok: true });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'websocket_required' }, 426);
    }

    const protocols = (request.headers.get('sec-websocket-protocol') || '')
      .split(',')
      .map(value => value.trim());

    if (protocols[0] !== 'turnstile-inspection') {
      return json({ error: 'protocol_required' }, 400);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'sec-websocket-protocol': 'turnstile-inspection'
      }
    });
  }

  async alarm() {
    const job = await this.state.storage.get('pendingDocument');
    if (!job) return;

    try {
      const result = await generatePendingDocument(
        this.env,
        Number(job.inspectionId),
        Number(job.version)
      );

      if (result?.status === 'ready' || result?.status === 'missing') {
        await this.state.storage.delete('pendingDocument');
        return;
      }

      await this.state.storage.setAlarm(Date.now() + 3 * 60 * 60 * 1000);
    } catch (error) {
      console.error('automatic_document_generation_failed', error);
      await this.state.storage.setAlarm(Date.now() + 3 * 60 * 60 * 1000);
    }
  }

  webSocketMessage(socket, message) {
    if (message === 'ping') {
      try { socket.send('pong'); } catch {}
    }
  }

  webSocketClose() {}
  webSocketError() {}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env)
      });
    }

    try {
      const response = await handleApi(request, env);
      if (response.status === 101) return response;
      return withCors(response, request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(
          json({
            error: error.code,
            detail: error.detail || undefined
          }, error.status),
          request,
          env
        );
      }

      console.error(error);
      return withCors(
        json({ error: 'internal_error' }, 500),
        request,
        env
      );
    }
  }
};
