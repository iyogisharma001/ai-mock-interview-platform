// Keeps the self-hosted backend reachable without anyone touching it.
//
// Every 20 seconds it checks the chain Docker -> backend containers -> Cloudflare tunnel and repairs
// whichever link is broken:
//   - Docker Desktop not running      -> starts it (Windows) and waits
//   - backend containers not running  -> docker compose up
//   - tunnel dead or address gone     -> recreates the tunnel (with a growing pause, so Cloudflare's
//                                        rate limit on new quick tunnels is never hammered)
//   - tunnel address changed          -> publishes it to the `backend-address` branch on GitHub
//
// The hosted site reads the address from that branch when it loads and again whenever a request
// fails, so a new address reaches open pages within about a minute and no redeploy is needed.
//
//   npm run watchdog          keep running
//   npm run tunnel:publish    one pass: repair if needed, publish, exit
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_FILE = path.join(root, 'tunnel-watchdog.log');
const BRANCH = 'backend-address';
const CHECK_EVERY_MS = 20_000;
const FAILS_BEFORE_RESTART = 3;
const ONCE = process.argv.includes('--once');
const COMPOSE = ['compose', '-f', 'docker-compose.tunnel.yml', '--env-file', 'deploy.env'];

const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = async (cmd, args, options = {}) => (await exec(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...options })).stdout;

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > 2 * 1024 * 1024) writeFileSync(LOG_FILE, ''); // keep the log small
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    /* logging must never stop the watchdog */
  }
}

async function ok(url, timeoutMs = 8000) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).ok;
  } catch {
    return false;
  }
}

// --- Docker -------------------------------------------------------------------------------------

async function dockerUp() {
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

let dockerStartedAt = 0;
function startDockerDesktop() {
  if (process.platform !== 'win32' || Date.now() - dockerStartedAt < 3 * 60_000) return;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
    path.join(process.env.ProgramFiles || '', 'Docker', 'Docker', 'Docker Desktop.exe'),
  ];
  const exe = candidates.find((candidate) => existsSync(candidate));
  if (!exe) return log('Docker is not running and Docker Desktop could not be found. Start Docker manually.');
  dockerStartedAt = Date.now();
  log('Docker is not running: starting Docker Desktop');
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
}

// --- Tunnel -------------------------------------------------------------------------------------

async function tunnelUrl() {
  try {
    const logs = await run('docker', [...COMPOSE, 'logs', '--no-log-prefix', '--tail', '400', 'tunnel']);
    // Quick-tunnel hostnames are words joined by hyphens (this skips api.trycloudflare.com).
    const matches = logs.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/g);
    return matches ? matches[matches.length - 1] : null;
  } catch {
    return null;
  }
}

let lastTunnelRestart = 0;
let restartPauseMs = 60_000;
async function restartTunnel(reason) {
  const wait = lastTunnelRestart + restartPauseMs - Date.now();
  if (wait > 0) return log(`Tunnel is down (${reason}); next restart in ${Math.ceil(wait / 1000)} s`);
  log(`Tunnel is down (${reason}): requesting a new one`);
  lastTunnelRestart = Date.now();
  restartPauseMs = Math.min(restartPauseMs * 2, 10 * 60_000); // back off if Cloudflare keeps refusing
  try {
    await run('docker', [...COMPOSE, 'up', '-d', '--force-recreate', '--no-deps', 'tunnel'], { timeout: 120_000 });
  } catch (err) {
    log(`Could not restart the tunnel: ${String(err.stderr || err.message).trim().split('\n').pop()}`);
  }
}

// --- Publishing ---------------------------------------------------------------------------------

async function publishedUrl() {
  try {
    await run('git', ['fetch', '--quiet', 'origin', BRANCH], { timeout: 60_000 });
    await run('git', ['show', 'FETCH_HEAD:vercel.json']); // older layouts lacked this: republish them
    return JSON.parse(await run('git', ['show', 'FETCH_HEAD:backend.json'])).url;
  } catch {
    return null; // branch does not exist yet, or we are offline
  }
}

/** Force-push a one-file, one-commit branch using git plumbing: the working tree is never touched. */
async function publish(url) {
  const pipe = (args, input) => new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
    child.stdin.end(input);
  });
  const blob = await pipe(['hash-object', '-w', '--stdin'], `${JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  // The branch holds data, not a site: tell Vercel not to try to build it on every update.
  const noDeploy = await pipe(['hash-object', '-w', '--stdin'], `${JSON.stringify({ git: { deploymentEnabled: false } }, null, 2)}\n`);
  const tree = await pipe(['mktree'], `100644 blob ${blob}\tbackend.json\n100644 blob ${noDeploy}\tvercel.json\n`);
  const commit = await pipe(['commit-tree', tree, '-m', 'Backend address'], '');
  await run('git', ['push', '--quiet', '--force', 'origin', `${commit}:refs/heads/${BRANCH}`], { timeout: 60_000 });
}

// --- Main loop ----------------------------------------------------------------------------------

let fails = 0;
let lastPublished;
let lastState = '';
const state = (text) => {
  if (text !== lastState) log(text);
  lastState = text;
};

async function pass() {
  if (!(await dockerUp())) {
    startDockerDesktop();
    state('Waiting for Docker to start');
    return false;
  }

  if (!(await ok('http://localhost:4000/api/health', 5000))) {
    state('Backend containers are not answering: starting them');
    try {
      await run('docker', [...COMPOSE, 'up', '-d'], { timeout: 10 * 60_000 });
    } catch (err) {
      log(`docker compose up failed: ${String(err.stderr || err.message).trim().split('\n').pop()}`);
    }
    return false;
  }

  const url = await tunnelUrl();
  if (!url || !(await ok(`${url}/api/health`))) {
    fails += 1;
    state(`Backend is up but the tunnel is not answering (${fails}/${FAILS_BEFORE_RESTART})`);
    if (fails >= FAILS_BEFORE_RESTART || !url) {
      await restartTunnel(url ? 'not answering' : 'no address');
      fails = 0;
    }
    return false;
  }

  fails = 0;
  restartPauseMs = 60_000;
  lastPublished ??= await publishedUrl();
  if (lastPublished !== url) {
    try {
      await publish(url);
      lastPublished = url;
      log(`Published new backend address: ${url}`);
    } catch (err) {
      log(`Could not publish the address: ${String(err.stderr || err.message).trim().split('\n').pop()}`);
      return false;
    }
  }
  state(`Healthy: ${url}`);
  return true;
}

log(`Watchdog started${ONCE ? ' (single pass)' : ''}`);
if (ONCE) {
  // Repair if needed, but give up after ten minutes rather than hang a terminal forever.
  const deadline = Date.now() + 10 * 60_000;
  let healthy = false;
  while (!(healthy = await pass()) && Date.now() < deadline) await sleep(10_000);
  process.exit(healthy ? 0 : 1);
}
for (;;) {
  try {
    await pass();
  } catch (err) {
    log(`Unexpected error: ${err.message}`);
  }
  await sleep(CHECK_EVERY_MS);
}
