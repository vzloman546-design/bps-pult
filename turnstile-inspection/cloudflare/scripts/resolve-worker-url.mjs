import { writeFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const workerName = process.env.WORKER_NAME || 'turnstile-inspection-api';

if (!accountId || !token) throw new Error('Cloudflare credentials are missing');

const response = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/subdomain',
  {
    headers: {
      authorization: 'Bearer ' + token
    }
  }
);

const payload = await response.json();

if (!response.ok || !payload?.success || !payload.result?.subdomain) {
  throw new Error('Unable to resolve workers.dev subdomain: ' + JSON.stringify(payload?.errors || payload));
}

const url = 'https://' + workerName + '.' + payload.result.subdomain + '.workers.dev';

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    'worker_url=' + url + '\n',
    { flag: 'a' }
  );
}

console.log(url);
