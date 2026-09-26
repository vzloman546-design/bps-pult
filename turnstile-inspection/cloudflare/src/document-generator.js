import { notifyAdmins } from './notifications.js';
import { broadcastInspection } from './inspection-service.js';

function appBase(env) {
  const value = String(env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (!value) throw new Error('PUBLIC_APP_URL is not configured');
  return value;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export async function loadDocumentSnapshot(env, inspectionId) {
  const inspection = await env.DB.prepare(
    `SELECT * FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (!inspection) throw new Error('inspection_not_found');
  if (inspection.status !== 'completed') throw new Error('inspection_not_completed');

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
      checks: checks.map(check => ({
        code: check.turnstile_code,
        visual: check.visual,
        power: check.power,
        reader: check.reader,
        status: check.final_status,
        remarks: check.remarks,
        updatedAt: check.updated_at
      }))
    });
  }

  return {
    id: inspection.id,
    title: inspection.title,
    status: inspection.status,
    startedAt: inspection.started_at,
    completedAt: inspection.completed_at,
    currentDocumentVersion: inspection.current_document_version,
    gates: output
  };
}

function script(base, name) {
  return '<script src="' + base + '/' + name + '"><\\/script>';
}

function buildPrintHtml(env, snapshot) {
  const base = appBase(env);

  const scripts = [
    'assets-init.js',
    'asset-page1-1.js',
    'asset-page2-1.js',
    'asset-page2-2.js',
    'asset-page3-1.js',
    'asset-page3-2.js',
    'asset-page4-1.js',
    'asset-page4-2.js',
    'asset-page5-1.js',
    'asset-page5-2.js',
    'asset-page6-1.js',
    'asset-atlas-1.js',
    'asset-atlas-2.js',
    'asset-atlas-3.js',
    'assets-meta.js',
    'assets-final.js',
    'pdf-renderer.js'
  ].map(name => script(base, name)).join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Акт технического осмотра</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    #serverPrintRoot { margin: 0; padding: 0; }
    .server-print-page {
      display: block;
      width: 297mm;
      height: 210mm;
      margin: 0;
      object-fit: fill;
      break-after: page;
      page-break-after: always;
    }
    .server-print-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    #pdf-ready, #pdf-failed { display: none !important; }
  </style>
</head>
<body>
  <main id="serverPrintRoot"></main>
  ${scripts}
  <script>window.__TURNSTILE_PRINT_SNAPSHOT=${safeJson(snapshot)};<\/script>
  ${script(base, 'server-print.js')}
</body>
</html>`;
}

async function pendingDocument(env, inspectionId, version) {
  return env.DB.prepare(
    `SELECT * FROM documents
     WHERE inspection_id=? AND version=?`
  ).bind(inspectionId, version).first();
}

async function recordFailure(env, inspectionId, version, error) {
  const message = String(error?.message || error).slice(0, 900);

  await env.DB.prepare(
    `INSERT INTO inspection_events
      (inspection_id,event_type,payload_json)
     VALUES (?,?,?)`
  ).bind(
    inspectionId,
    'document_generation_retry',
    JSON.stringify({ version, error: message })
  ).run();
}

export async function generatePendingDocument(env, inspectionId, version) {
  const document = await pendingDocument(env, inspectionId, version);

  if (!document) return { status: 'missing' };
  if (document.status === 'ready') return { status: 'ready' };
  if (!env.BROWSER) throw new Error('Browser Run binding is not configured');

  const snapshot = await loadDocumentSnapshot(env, inspectionId);
  const html = buildPrintHtml(env, snapshot);

  let response;

  try {
    response = await env.BROWSER.quickAction('pdf', {
      html,
      viewport: {
        width: 1400,
        height: 1000,
        deviceScaleFactor: 1
      },
      waitForSelector: {
        selector: '#pdf-ready',
        timeout: 60000
      },
      pdfOptions: {
        format: 'a4',
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        },
        timeout: 60000
      }
    });
  } catch (error) {
    await recordFailure(env, inspectionId, version, error);
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(
      'Browser Run PDF failed: ' + response.status + ' ' + detail.slice(0, 400)
    );
    await recordFailure(env, inspectionId, version, error);
    throw error;
  }

  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) {
    const error = new Error('Browser Run returned empty PDF');
    await recordFailure(env, inspectionId, version, error);
    throw error;
  }

  const key = `inspection:${inspectionId}:document:${version}.pdf`;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');

  await env.DOCUMENTS.put(key, bytes, {
    metadata: {
      inspectionId: String(inspectionId),
      version: String(version)
    }
  });

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE documents
       SET status='ready',kv_key=?,sha256=?,byte_size=?,
           generated_by_user_id=NULL,ready_at=datetime('now')
       WHERE inspection_id=? AND version=?`
    ).bind(key, sha256, bytes.byteLength, inspectionId, version),

    env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,event_type,payload_json)
       VALUES (?,?,?)`
    ).bind(
      inspectionId,
      'document_ready',
      JSON.stringify({ version, byteSize: bytes.byteLength, generator: 'cloudflare-browser-run' })
    )
  ]);

  await notifyAdmins(
    env,
    'document_ready',
    'Акт сформирован',
    'Осмотр завершён. Готовый PDF уже доступен в приложении.',
    inspectionId,
    null
  );

  await broadcastInspection(env, inspectionId, {
    type: 'document_ready',
    inspectionId,
    version
  });

  return {
    status: 'ready',
    byteSize: bytes.byteLength,
    version
  };
}
