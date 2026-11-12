// When the client is hosted separately from the API (for example on Vercel or Netlify), set
// VITE_API_URL to the backend's origin, e.g. https://api.example.com. Left empty, requests go to
// the same origin, which is what the Vite dev proxy expects.
//
// /backend.json (client/public/backend.json) overrides it at runtime. `npm run tunnel:publish`
// rewrites that file whenever the tunnel address changes, so no dashboard setting has to be edited.
const clean = (url) => String(url || '').trim().replace(/\/+$/, '');
let origin = clean(import.meta.env.VITE_API_URL);

export const apiOrigin = () => origin;

/** Load the runtime override once, before the app renders. Never rejects. */
export async function loadBackendConfig() {
  try {
    const res = await fetch('/backend.json', { cache: 'no-store' });
    if (!res.ok) return;
    const config = await res.json();
    if (/^https?:\/\//.test(config?.url || '')) origin = clean(config.url);
  } catch {
    /* no override published: keep the build-time value */
  }
}

export const LANGUAGES = { python: 'Python', javascript: 'JavaScript', cpp: 'C++' };
export const languageLabel = (id) => LANGUAGES[id] || (id === 'markdown' ? 'Notes' : id);

const RETRY_DELAYS_MS = [700, 2000];

async function request(path, options = {}) {
  // A tunnel or mobile connection can drop a single request. Retry network failures (never HTTP
  // errors) a couple of times before telling the user the server is unreachable.
  let res;
  for (let attempt = 0; ; attempt += 1) {
    try {
      res = await fetch(`${origin}/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      break;
    } catch {
      if (attempt >= RETRY_DELAYS_MS.length) throw new Error('Cannot reach the interview server. Check that it is running and try again.');
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return { status: res.status, data };
}

export const api = {
  problems: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/problems?${query}`).then((r) => r.data);
  },
  problemMeta: () => request('/problems/meta').then((r) => r.data),
  createInterview: (body) => request('/interviews', { method: 'POST', body }).then((r) => r.data),
  interview: (id) => request(`/interviews/${id}`).then((r) => r.data),
  report: (id) => request(`/interviews/${id}/report`).then((r) => r.data),
};
