import { writeFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !token) {
  throw new Error('Cloudflare credentials are missing');
}

const D1_NAME = 'turnstile-inspection';
const KV_TITLE = 'turnstile-inspection-documents';
const PAGES_PROJECT = 'vzloman546-turnstile-inspection';

async function cf(path, options = {}, allow404 = false) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + token,
      ...(options.headers || {})
    }
  });

  if (allow404 && response.status === 404) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(
      'Cloudflare API ' + response.status + ': ' +
      JSON.stringify(payload?.errors || payload || {})
    );
  }

  return payload.result;
}

async function getOrCreateD1() {
  const list = await cf('/accounts/' + accountId + '/d1/database?name=' + encodeURIComponent(D1_NAME) + '&per_page=100');
  const existing = Array.isArray(list) ? list.find(db => db.name === D1_NAME) : null;
  if (existing) return existing;

  return cf('/accounts/' + accountId + '/d1/database', {
    method: 'POST',
    body: JSON.stringify({ name: D1_NAME })
  });
}

async function getOrCreateKv() {
  const list = await cf('/accounts/' + accountId + '/storage/kv/namespaces?per_page=100');
  const existing = Array.isArray(list) ? list.find(ns => ns.title === KV_TITLE) : null;
  if (existing) return existing;

  return cf('/accounts/' + accountId + '/storage/kv/namespaces', {
    method: 'POST',
    body: JSON.stringify({ title: KV_TITLE })
  });
}

async function getOrCreatePages() {
  const current = await cf(
    '/accounts/' + accountId + '/pages/projects/' + encodeURIComponent(PAGES_PROJECT),
    {},
    true
  );
  if (current) return current;

  return cf('/accounts/' + accountId + '/pages/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: PAGES_PROJECT,
      production_branch: 'main'
    })
  });
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return writeFile(
    process.env.GITHUB_OUTPUT,
    name + '=' + value + '\n',
    { flag: 'a' }
  );
}

const [d1, kv, pages] = await Promise.all([
  getOrCreateD1(),
  getOrCreateKv(),
  getOrCreatePages()
]);

const d1Id = d1.uuid || d1.id;
const kvId = kv.id;
const pagesProject = pages.name || PAGES_PROJECT;
const pagesUrl = 'https://' + pagesProject + '.pages.dev';

if (!d1Id || !kvId) {
  throw new Error('Cloudflare resource identifiers were not returned');
}

const wrangler = `name = "turnstile-inspection-api"
main = "src/worker.js"
compatibility_date = "2026-09-26"
workers_dev = true

[vars]
ALLOWED_ORIGIN = "${pagesUrl}"
SESSION_TTL_DAYS = "30"
PUBLIC_APP_URL = "${pagesUrl}"
VAPID_SUBJECT = "${pagesUrl}"

[[d1_databases]]
binding = "DB"
database_name = "${D1_NAME}"
database_id = "${d1Id}"

[[kv_namespaces]]
binding = "DOCUMENTS"
id = "${kvId}"

[[durable_objects.bindings]]
name = "INSPECTION_ROOM"
class_name = "InspectionRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["InspectionRoom"]

[browser]
binding = "BROWSER"
`;

await writeFile(new URL('../wrangler.production.toml', import.meta.url), wrangler);

await writeFile(
  new URL('../deployment.production.json', import.meta.url),
  JSON.stringify({
    d1Id,
    kvId,
    pagesProject,
    pagesUrl
  }, null, 2) + '\n'
);

await output('d1_id', d1Id);
await output('kv_id', kvId);
await output('pages_project', pagesProject);
await output('pages_url', pagesUrl);

console.log('Cloudflare resources ready');
console.log('D1:', D1_NAME);
console.log('KV:', KV_TITLE);
console.log('Pages:', pagesUrl);
