// Talks to the site's own /api/ai function (Vercel), which holds the Gemini key. If it is not
// configured, unreachable or out of quota, callers fall back to the rule-based interviewer.
let status = null;

/** Resolves to true when the hosted AI function is configured. Never rejects. */
export function aiAvailable() {
  status ??= fetch('/api/ai', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    .then((res) => (res.ok ? res.json() : { configured: false }))
    .then((data) => Boolean(data.configured))
    .catch(() => false);
  return status;
}

/** Stream a spoken reply. Resolves when finished; rejects if no text could be produced. */
export async function chatStream({ system, messages, onDelta, signal }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'chat', system, messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`ai ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) {
      received = true;
      onDelta(text);
    }
  }
  if (!received) throw new Error('empty reply');
}

/** Structured output; resolves to the parsed object or null. Never rejects. */
export async function structured({ system, prompt, schema, thinkingBudget = 0, timeoutMs = 50_000 }) {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'json', system, prompt, schema, thinkingBudget }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch {
    return null;
  }
}
