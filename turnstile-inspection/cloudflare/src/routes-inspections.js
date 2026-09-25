import { HttpError, json, readJson } from './http.js';
import { requireAdmin } from './auth.js';
import {
  canAccessInspection,
  createInspection,
  getGate,
  getInspectionSummary,
  listInspections,
  reassignGate,
  reopenGate,
  updateTurnstile
} from './inspection-service.js';

export async function handleInspectionRoutes(request, env, parts, user) {
  if (parts.length === 2 && request.method === 'GET') {
    return json({ inspections: await listInspections(env, user) });
  }

  if (parts.length === 2 && request.method === 'POST') {
    requireAdmin(user);
    const input = await readJson(request);
    return json({ inspection: await createInspection(env, user, input) }, 201);
  }

  const inspectionId = Number(parts[2]);
  if (!Number.isInteger(inspectionId)) throw new HttpError(404, 'inspection_not_found');

  if (parts.length === 3 && request.method === 'GET') {
    return json({ inspection: await getInspectionSummary(env, inspectionId, user) });
  }

  if (parts[3] === 'gates' && parts[4]) {
    const gateNo = Number(parts[4]);

    if (parts.length === 5 && request.method === 'GET') {
      return json({ gate: await getGate(env, inspectionId, gateNo, user) });
    }

    if (parts[5] === 'assign' && request.method === 'PATCH') {
      requireAdmin(user);
      const input = await readJson(request);
      await reassignGate(env, inspectionId, gateNo, String(input.assigneeUserId || ''), user);
      return json({ ok: true });
    }

    if (parts[5] === 'reopen' && request.method === 'PATCH') {
      requireAdmin(user);
      await reopenGate(env, inspectionId, gateNo, user);
      return json({ ok: true });
    }

    if (parts[5] === 'checks' && parts[6] && request.method === 'PATCH') {
      const code = decodeURIComponent(parts.slice(6).join('/'));
      const patch = await readJson(request);
      const result = await updateTurnstile(env, inspectionId, gateNo, code, patch, user);
      return json({ ok: true, ...result });
    }
  }

  if (parts[3] === 'generation-snapshot' && request.method === 'GET') {
    if (!(await canAccessInspection(env, user, inspectionId))) {
      throw new HttpError(403, 'inspection_forbidden');
    }

    const inspection = await env.DB.prepare(
      `SELECT * FROM inspections WHERE id=?`
    ).bind(inspectionId).first();

    if (!inspection) throw new HttpError(404, 'inspection_not_found');
    if (inspection.status !== 'completed') throw new HttpError(409, 'inspection_not_completed');

    const gates = (await env.DB.prepare(
      `SELECT g.id,g.gate_no,g.assignee_user_id,u.display_name AS assignee_name
       FROM inspection_gates g
       LEFT JOIN users u ON u.id=g.assignee_user_id
       WHERE g.inspection_id=?
       ORDER BY g.gate_no`
    ).bind(inspectionId).all()).results || [];

    const output = [];

    for (const gate of gates) {
      const checks = (await env.DB.prepare(
        `SELECT turnstile_code,visual,power,reader,final_status,remarks,updated_at
         FROM turnstile_checks
         WHERE inspection_gate_id=?
         ORDER BY id`
      ).bind(gate.id).all()).results || [];

      output.push({
        gateNo: gate.gate_no,
        assigneeName: gate.assignee_name,
        checks: checks.map(c => ({
          code: c.turnstile_code,
          visual: c.visual,
          power: c.power,
          reader: c.reader,
          status: c.final_status,
          remarks: c.remarks,
          updatedAt: c.updated_at
        }))
      });
    }

    return json({
      inspection: {
        id: inspection.id,
        title: inspection.title,
        status: inspection.status,
        startedAt: inspection.started_at,
        completedAt: inspection.completed_at,
        currentDocumentVersion: inspection.current_document_version,
        gates: output
      }
    });
  }

  if (parts[3] === 'document' && parts.length === 4 && request.method === 'GET') {
    if (!(await canAccessInspection(env, user, inspectionId))) {
      throw new HttpError(403, 'inspection_forbidden');
    }

    const document = await env.DB.prepare(
      `SELECT id,version,status,byte_size,ready_at
       FROM documents
       WHERE inspection_id=?
       ORDER BY version DESC
       LIMIT 1`
    ).bind(inspectionId).first();

    return json({ document: document || null });
  }

  if (parts[3] === 'document' && parts[4] === 'upload' && request.method === 'POST') {
    if (!(await canAccessInspection(env, user, inspectionId))) {
      throw new HttpError(403, 'inspection_forbidden');
    }

    const document = await env.DB.prepare(
      `SELECT * FROM documents
       WHERE inspection_id=?
       ORDER BY version DESC
       LIMIT 1`
    ).bind(inspectionId).first();

    if (!document || document.status !== 'pending') {
      throw new HttpError(409, 'document_not_pending');
    }

    const contentType = (request.headers.get('content-type') || '').split(';')[0];
    if (contentType !== 'application/pdf') throw new HttpError(415, 'pdf_required');

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) {
      throw new HttpError(413, 'invalid_pdf_size');
    }

    const key = `inspection:${inspectionId}:document:${document.version}.pdf`;
    await env.DOCUMENTS.put(key, bytes, {
      metadata: { inspectionId: String(inspectionId), version: String(document.version) }
    });

    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

    await env.DB.prepare(
      `UPDATE documents
       SET status='ready',kv_key=?,sha256=?,byte_size=?,
           generated_by_user_id=?,ready_at=datetime('now')
       WHERE id=?`
    ).bind(key, sha256, bytes.byteLength, user.id, document.id).run();

    await env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?)`
    ).bind(
      inspectionId,
      user.id,
      'document_ready',
      JSON.stringify({ version: document.version, byteSize: bytes.byteLength })
    ).run();

    const { notifyAdmins } = await import('./notifications.js');
    const { broadcastInspection } = await import('./inspection-service.js');

    await notifyAdmins(
      env,
      'document_ready',
      'Акт сформирован',
      'Готовый PDF доступен в приложении.',
      inspectionId,
      null
    );

    await broadcastInspection(env, inspectionId, {
      type: 'document_ready',
      inspectionId,
      version: document.version
    });

    return json({ ok: true, version: document.version });
  }

  if (parts[3] === 'document' && parts[4] === 'file' && request.method === 'GET') {
    if (!(await canAccessInspection(env, user, inspectionId))) {
      throw new HttpError(403, 'inspection_forbidden');
    }

    const document = await env.DB.prepare(
      `SELECT * FROM documents
       WHERE inspection_id=? AND status='ready'
       ORDER BY version DESC
       LIMIT 1`
    ).bind(inspectionId).first();

    if (!document?.kv_key) throw new HttpError(404, 'document_not_ready');

    const bytes = await env.DOCUMENTS.get(document.kv_key, { type: 'arrayBuffer' });
    if (!bytes) throw new HttpError(404, 'document_missing');

    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="inspection-${inspectionId}-v${document.version}.pdf"`,
        'cache-control': 'private, no-store'
      }
    });
  }

  throw new HttpError(404, 'not_found');
}
