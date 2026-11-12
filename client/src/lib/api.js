// Where is the backend?
//
// Same origin in local development (the Vite dev server proxies /api and /socket.io). When the
// client is hosted separately, the address comes from, in order:
//   1. the `backend-address` branch of the repository, kept current by scripts/tunnel-watchdog.mjs.
//      It is read at load and again whenever a request fails, so a backend that moves to a new
//      address is picked up by pages that are already open, with no rebuild.
//   2. VITE_API_URL, fixed at build time (use this alone for a backend with a permanent address).
const clean = (url) => String(url || '').trim().replace(/\/+$/, '');
let origin = clean(import.meta.env.VITE_API_URL);

const REPO = import.meta.env.VITE_ADDRESS_REPO ?? 'iyogisharma001/ai-mock-interview-platform';
const ADDRESS_SOURCES = !REPO || import.meta.env.DEV ? [] : [
  // The API is always fresh but rate-limited per visitor; the raw host is unlimited but cached.
  { url: `https://api.github.com/repos/${REPO}/contents/backend.json?ref=backend-address`, headers: { Accept: 'application/vnd.github.raw+json' } },
  { url: `https://raw.githubusercontent.com/${REPO}/backend-address/backend.json`, headers: {} },
];

export const apiOrigin = () => origin;

let loading = null;
/** Refresh the backend address. Resolves to true when it changed. Never rejects. */
export function loadBackendConfig() {
  loading ??= (async () => {
    const before = origin;
    for (const source of ADDRESS_SOURCES) {
      try {
        const res = await fetch(source.url, { headers: source.headers, cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const config = await res.json();
        if (/^https:\/\/[a-z0-9.-]+$/i.test(config?.url || '')) {
          origin = clean(config.url);
          break;
        }
      } catch {
        /* try the next source */
      }
    }
    return origin !== before;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export const LANGUAGES = { python: 'Python', javascript: 'JavaScript', cpp: 'C++' };
export const languageLabel = (id) => LANGUAGES[id] || (id === 'markdown' ? 'Notes' : id);

export class UnreachableError extends Error {
  constructor() {
    super('The interview server is not reachable right now. Retrying automatically…');
    this.unreachable = true;
  }
}

const RETRY_DELAYS_MS = [700, 2000];

async function attempt(path, options) {
  const res = await fetch(`${origin}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  // 52x/530 come from the tunnel provider when it cannot reach the backend: same as a network failure.
  if (res.status >= 520 && res.status <= 530) throw new Error('tunnel');
  return res;
}

async function request(path, options = {}) {
  // A tunnel or mobile connection can drop a single request, and a self-hosted backend can move to
  // a new address. Retry network failures (never real HTTP errors), then look the address up again.
  let res;
  for (let tries = 0; ; tries += 1) {
    try {
      res = await attempt(path, options);
      break;
    } catch {
      if (tries < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[tries]));
      } else if (tries === RETRY_DELAYS_MS.length && (await loadBackendConfig())) {
        /* the backend moved: one more attempt at the new address */
      } else throw new UnreachableError();
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------------------------
// Server or standalone?
//
// The full backend (Docker sandbox, C++, server-side AI) is used whenever it answers. When it does
// not, the site carries on by itself: problems come from /catalogue.json, code runs in the browser
// and interviews are kept in this browser. Visitors never see an "unreachable" error.
// ---------------------------------------------------------------------------------------------

let mode = null; // 'server' | 'standalone'
let deciding = null;
const modeListeners = new Set();

function setMode(next) {
  if (mode === next) return;
  mode = next;
  for (const listener of modeListeners) listener(mode);
}

/** Subscribe to mode changes; returns an unsubscribe function. */
export function onModeChange(listener) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}
export const currentMode = () => mode;

async function backendAnswers() {
  try {
    const res = await fetch(`${origin}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(4500) });
    if (!res.ok) return false;
    const health = await res.json();
    return health?.mongo === 'up' && health?.redis === 'up';
  } catch {
    return false;
  }
}

/** Decide once per page load which mode to use. Never rejects. */
export function decideMode() {
  if (mode) return Promise.resolve(mode);
  deciding ??= (async () => {
    let ok = await backendAnswers();
    if (!ok && (await loadBackendConfig())) ok = await backendAnswers(); // the backend moved
    setMode(ok ? 'server' : 'standalone');
    return mode;
  })();
  return deciding;
}

/** Use the server; if it turns out to be unreachable, switch to standalone and use `local`. */
async function either(remote, local) {
  if ((await decideMode()) === 'server') {
    try {
      return await remote();
    } catch (err) {
      if (!err.unreachable) throw err;
      setMode('standalone');
    }
  }
  return local();
}

const standalone = () => import('../standalone/index.js');

export const api = {
  problems: (params = {}) => either(
    () => request(`/problems?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null))}`).then((r) => r.data),
    async () => (await standalone()).listProblems(params),
  ),
  problemMeta: () => either(
    () => request('/problems/meta').then((r) => r.data),
    async () => (await standalone()).catalogueMeta(),
  ),
  createInterview: (body) => either(
    () => request('/interviews', { method: 'POST', body }).then((r) => r.data),
    async () => (await standalone()).createInterview(body),
  ),
  interview: async (id) => {
    if ((await standalone()).isLocalId(id)) return (await standalone()).interviewDetails(id);
    return request(`/interviews/${id}`).then((r) => r.data);
  },
  report: async (id) => {
    if ((await standalone()).isLocalId(id)) return (await standalone()).reportFor(id);
    return request(`/interviews/${id}/report`).then((r) => r.data);
  },
};
