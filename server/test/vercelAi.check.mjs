// Exercises the Vercel function api/ai.mjs locally with fake request/response objects.
// Without GEMINI_API_KEY it only checks the not-configured paths; with it, it makes two small calls.
//   node test/vercelAi.check.mjs
import assert from 'node:assert/strict';

const { default: handler } = await import('../../api/ai.mjs');
const keyed = Boolean(process.env.GEMINI_API_KEY);

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '', ended: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.writeHead = (code, headers) => { res.statusCode = code; Object.assign(res.headers, headers); };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = JSON.stringify(data); res.ended = true; return res; };
  res.write = (chunk) => { res.body += chunk; };
  res.end = () => { res.ended = true; };
  return res;
}
const call = async (method, body, headers = {}) => {
  const res = fakeRes();
  await handler({ method, body, headers: { host: 'site.example', ...headers } }, res);
  return res;
};

const info = await call('GET');
console.log('GET ->', info.statusCode, info.body);
assert.equal(JSON.parse(info.body).configured, keyed);

const foreign = await call('POST', { mode: 'chat' }, { origin: 'https://evil.example' });
assert.equal(foreign.statusCode, 403, 'other websites must be refused');

if (!keyed) {
  const off = await call('POST', { mode: 'chat', system: 'x', messages: [] }, { origin: 'https://site.example' });
  assert.equal(off.statusCode, 503);
  console.log('✔ not-configured behaviour is correct (set GEMINI_API_KEY to test real calls)');
  process.exit(0);
}

const chat = await call('POST', {
  mode: 'chat',
  system: 'You are an interviewer. One short sentence, no markdown.',
  messages: [{ role: 'user', content: 'What line is the loop on?\n\n<editor language="python">\n  1| def f(a):\n  2|     for x in a:\n  3|         print(x)\n</editor>' }],
}, { origin: 'https://site.example' });
console.log('chat ->', chat.statusCode, chat.headers['x-model'], JSON.stringify(chat.body));
assert.equal(chat.statusCode, 200);
assert.match(chat.body, /\b(2|two)\b/i);

const json = await call('POST', {
  mode: 'json',
  system: 'Classify the complexity.',
  prompt: 'for i in a:\n  for j in a:\n    pass',
  schema: { type: 'object', properties: { time_complexity: { type: 'string' } }, required: ['time_complexity'] },
  thinkingBudget: 0,
});
console.log('json ->', json.statusCode, json.body);
assert.equal(json.statusCode, 200);
assert.match(JSON.parse(json.body).result.time_complexity, /n/i);
console.log('✔ Vercel AI function works');
