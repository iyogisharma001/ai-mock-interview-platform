// Vercel serverless function: the hosted site's AI interviewer when the main backend is offline.
// Keeps the Gemini key on the server. Uses Gemini's REST API directly so it needs no dependencies.
//
//   GET  /api/ai                                  -> { configured: boolean }
//   POST /api/ai { mode: 'chat', system, messages } -> streamed plain text
//   POST /api/ai { mode: 'json', system, prompt, schema, thinkingBudget } -> JSON object
//
// Configure in Vercel: Project -> Settings -> Environment Variables -> GEMINI_API_KEY
// (optionally AI_MODEL and AI_MODEL_FALLBACKS, comma-separated), then redeploy.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const MODELS = [...new Set([process.env.AI_MODEL || 'gemini-3.8-flash', ...(process.env.AI_MODEL_FALLBACKS || 'gemini-3.5-flash,gemini-3.1-flash-lite').split(',')]
  .map((m) => m.trim()).filter((m) => /^[a-z0-9.-]+$/.test(m)))];

const MAX_BODY_CHARS = 120_000;
const FIRST_WORD_TIMEOUT_MS = 8000;
const JSON_TIMEOUT_MS = 45_000;

export const config = { maxDuration: 60 };

/** Only this site may use the function from a browser. */
function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers['x-forwarded-host'] || new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function toContents(messages) {
  const contents = [];
  for (const { role, content } of messages) {
    const mapped = role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last?.role === mapped) last.parts[0].text += `\n\n${content}`;
    else contents.push({ role: mapped, parts: [{ text: String(content) }] });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();
  return contents;
}

const retryable = (status) => status === 404 || status === 400 || status === 429 || status >= 500;

/** Stream the reply as plain text. Falls through the model list until one starts answering. */
async function chat(body, res) {
  const payload = {
    systemInstruction: { parts: [{ text: String(body.system || '') }] },
    contents: toContents(Array.isArray(body.messages) ? body.messages.slice(-40) : []),
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
  };
  for (const model of MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FIRST_WORD_TIMEOUT_MS);
    let started = false;
    try {
      const upstream = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        clearTimeout(timer);
        if (retryable(upstream.status)) continue;
        return res.status(502).json({ error: `model error ${upstream.status}` });
      }
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 1);
          if (!line.startsWith('data:')) continue;
          let event;
          try {
            event = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          const text = (event.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('');
          if (!text) continue;
          if (!started) {
            started = true;
            clearTimeout(timer); // the reply has begun: let it finish
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Model': model });
          }
          res.write(text);
        }
      }
      clearTimeout(timer);
      if (started) return res.end();
    } catch {
      clearTimeout(timer);
      if (started) return res.end(); // the candidate already heard part of it: stop, do not restart
    }
  }
  return res.status(503).json({ error: 'no model available' });
}

/** Structured output that matches `schema`. */
async function json(body, res) {
  const budget = Number.isInteger(body.thinkingBudget) ? Math.max(-1, Math.min(body.thinkingBudget, 8192)) : 0;
  const payload = {
    systemInstruction: { parts: [{ text: String(body.system || '') }] },
    contents: [{ role: 'user', parts: [{ text: String(body.prompt || '') }] }],
    generationConfig: {
      maxOutputTokens: budget === 0 ? 2048 : 16384,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: budget },
      responseMimeType: 'application/json',
      responseJsonSchema: body.schema,
    },
  };
  for (const model of MODELS) {
    try {
      const upstream = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        if (retryable(upstream.status)) continue;
        return res.status(502).json({ error: `model error ${upstream.status}` });
      }
      const data = await upstream.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('');
      try {
        return res.status(200).json({ result: JSON.parse(text), model });
      } catch {
        continue; // unusable answer: try the next model
      }
    } catch {
      /* timeout or network: try the next model */
    }
  }
  return res.status(503).json({ error: 'no model available' });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    // Diagnostics for setup problems: which deployment this is and which key-like settings exist.
    // Names only, never values.
    const keyNames = Object.keys(process.env).filter((name) => /gemini|google|genai|api_?key/i.test(name)).sort();
    return res.status(200).json({
      configured: Boolean(KEY),
      models: KEY ? MODELS : [],
      environment: process.env.VERCEL_ENV || 'unknown',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
      keyNamesSeen: keyNames,
      expected: 'GEMINI_API_KEY',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!sameSite(req)) return res.status(403).json({ error: 'forbidden' });
  if (!KEY) return res.status(503).json({ error: 'not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (JSON.stringify(body).length > MAX_BODY_CHARS) return res.status(413).json({ error: 'request too large' });
  if (body.mode === 'chat') return chat(body, res);
  if (body.mode === 'json' && body.schema && typeof body.schema === 'object') return json(body, res);
  return res.status(400).json({ error: 'bad request' });
}
