// When the client is hosted separately from the API (for example on Vercel or Netlify), set
// VITE_API_URL to the backend's origin, e.g. https://api.example.com. Left empty, requests go to
// the same origin, which is what the Vite dev proxy expects.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const LANGUAGES = { python: 'Python', javascript: 'JavaScript', cpp: 'C++' };
export const languageLabel = (id) => LANGUAGES[id] || (id === 'markdown' ? 'Notes' : id);

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_ORIGIN}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the interview server. Check that it is running and try again.');
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
