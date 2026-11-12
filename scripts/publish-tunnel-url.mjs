// Reads the current Cloudflare quick-tunnel address from the running tunnel container, checks the
// backend answers through it, and writes it to client/public/backend.json. With --push it also
// commits and pushes that one file, so the hosted site redeploys pointing at the new address.
//
//   npm run tunnel:publish        write the file and push it
//   node scripts/publish-tunnel-url.mjs   write the file only
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'client', 'public', 'backend.json');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function currentTunnelUrl() {
  const logs = run('docker', ['compose', '-f', 'docker-compose.tunnel.yml', '--env-file', 'deploy.env', 'logs', '--no-log-prefix', 'tunnel']);
  // Quick-tunnel hostnames are several words joined by hyphens (this skips api.trycloudflare.com).
  const matches = logs.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/g);
  return matches ? matches[matches.length - 1] : null;
}

let url = null;
for (let i = 0; i < 15 && !url; i += 1) {
  url = currentTunnelUrl();
  if (!url) await sleep(2000);
}
if (!url) {
  console.error('No tunnel address found. Is the tunnel running? Try: npm run tunnel:up');
  process.exit(1);
}

let healthy = false;
for (let i = 0; i < 10 && !healthy; i += 1) {
  try {
    healthy = (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) })).ok;
  } catch {
    /* the hostname can take a few seconds to start resolving */
  }
  if (!healthy) await sleep(3000);
}
if (!healthy) {
  console.error(`${url} is not answering yet. Wait a minute and run this again.`);
  process.exit(1);
}

let previous = null;
try {
  previous = JSON.parse(readFileSync(target, 'utf8')).url;
} catch {
  /* first publish */
}
console.log(`Backend address: ${url}`);
if (previous === url) {
  console.log('Already published. Nothing to do.');
  process.exit(0);
}
writeFileSync(target, `${JSON.stringify({ url }, null, 2)}\n`);
console.log('Wrote client/public/backend.json');

if (process.argv.includes('--push')) {
  run('git', ['add', 'client/public/backend.json']);
  run('git', ['commit', '-m', 'Update backend address', '--', 'client/public/backend.json']);
  run('git', ['push']);
  console.log('Pushed. The hosted site will redeploy with the new address in about a minute.');
}
