// The one place that talks to the language model (Google Gemini via @google/genai).
// The interviewer in aiAgent.js only knows two operations: stream spoken text, and get JSON that
// matches a schema. Everything provider-specific stays in this file.
//
// Hosted models are not always there: they get overloaded (503), rate-limited (429), retired for an
// account (404), or simply stop answering. So every call has a time limit and walks a list of
// models, and a model that just failed is rested for a while so the next turn does not wait on it.
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { log } from '../utils/logger.js';

const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

// auto = use Gemini when a key is present; mock = never call the API; live = a key is required.
export const llmEnabled = env.AI_MODE !== 'mock' && Boolean(apiKey);
if (env.AI_MODE === 'live' && !apiKey) log.error('AI_MODE=live but GEMINI_API_KEY is not set: using the rule-based interviewer');

const ai = llmEnabled ? new GoogleGenAI({ apiKey }) : null;

const models = [...new Set([env.AI_MODEL, ...env.AI_MODEL_FALLBACKS.split(',').map((m) => m.trim()).filter(Boolean)])];
export const llmLabel = `Gemini (${models.join(' → ')})`;

const FIRST_WORD_TIMEOUT_MS = 7000; // a spoken reply that has not started by now is too late
const REST_MS = 3 * 60_000;
const unavailable = new Set(); // models this key cannot use at all
const restingUntil = new Map(); // models that just failed -> when to try them again

/** Thrown when the model returns nothing usable (safety block, empty answer, invalid JSON). */
export class EmptyResponseError extends Error {}
class ModelTimeoutError extends Error {}

function candidates() {
  const usable = models.filter((m) => !unavailable.has(m));
  const rested = usable.filter((m) => (restingUntil.get(m) || 0) <= Date.now());
  return rested.length ? rested : usable; // if everything is resting, try them all anyway
}

/** Decide what a failure means for the model that produced it. Returns true to try the next one. */
function recordFailure(where, model, err) {
  if (err instanceof ModelTimeoutError || (err instanceof ApiError && (err.status === 429 || err.status >= 500))) {
    restingUntil.set(model, Date.now() + REST_MS);
    log.warn(`[ai:${where}] ${model} ${err instanceof ModelTimeoutError ? 'did not answer in time' : `returned ${err.status}`}: resting it for ${REST_MS / 60_000} min`);
    return true;
  }
  // 404 = not offered to this key, 400 = this model rejects our request shape. Neither will change.
  if (err instanceof ApiError && (err.status === 404 || (err.status === 400 && !/api key/i.test(err.message)))) {
    unavailable.add(model);
    log.warn(`[ai:${where}] ${model} cannot be used with this key or request (${err.status}): skipping it from now on`);
    return true;
  }
  return false;
}

/** Gemini calls the assistant "model" and wants turns to alternate, so merge neighbours of one role. */
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

/**
 * Stream a conversational reply. `onDelta` receives text as it is generated.
 * @param {{system:string, messages:Array<{role:'user'|'assistant', content:string}>, onDelta:(text:string)=>void, signal?:AbortSignal}} args
 */
export async function streamText({ system, messages, onDelta, signal }) {
  const contents = toContents(messages);
  let received = false;
  let lastError;

  for (const model of candidates()) {
    if (signal?.aborted) return;
    const attempt = new AbortController();
    const onAbort = () => attempt.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      attempt.abort();
    }, FIRST_WORD_TIMEOUT_MS);

    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: system,
          abortSignal: attempt.signal,
          maxOutputTokens: 1024,
          temperature: 0.7,
          // Spoken replies are short and latency matters more than depth: no hidden reasoning pass.
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      for await (const chunk of stream) {
        if (signal?.aborted) return;
        const text = chunk.text;
        if (!text) continue;
        clearTimeout(timer); // the reply has started: let it finish
        received = true;
        onDelta(text);
      }
      if (received) {
        restingUntil.delete(model);
        return;
      }
      lastError = new EmptyResponseError('the model returned no text');
    } catch (err) {
      if (signal?.aborted) return; // the candidate talked over the interviewer: not a failure
      lastError = timedOut ? new ModelTimeoutError(`${model} timed out`) : err;
      // Never restart a reply the candidate has already begun to hear.
      if (received || !recordFailure('speak', model, lastError)) throw lastError;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError ?? new Error('no language model is available');
}

/** Gemini accepts a JSON Schema subset: drop the dialect marker and JavaScript's safe-integer bounds. */
function geminiSchema(schema) {
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      if ((key === 'minimum' || key === 'maximum') && Math.abs(value) >= Number.MAX_SAFE_INTEGER) continue;
      out[key] = strip(value);
    }
    return out;
  };
  return strip(z.toJSONSchema(schema));
}

/**
 * Ask for a JSON object matching a Zod schema. The response is validated before it is returned.
 * @param {{system:string, prompt:string, schema:import('zod').ZodType, thinkingBudget?:number, maxOutputTokens?:number, timeoutMs?:number}} args
 *   thinkingBudget: 0 disables reasoning, -1 lets the model decide, a positive number caps it.
 */
export async function generateJson({ system, prompt, schema, thinkingBudget = 0, maxOutputTokens = 2048, timeoutMs = 20_000 }) {
  const responseJsonSchema = geminiSchema(schema);
  let lastError;

  for (const model of candidates()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: system,
          abortSignal: AbortSignal.timeout(timeoutMs),
          maxOutputTokens,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget },
          responseMimeType: 'application/json',
          responseJsonSchema,
        },
      });
      const text = response.text;
      if (!text) throw new EmptyResponseError(`no output (finish reason: ${response.candidates?.[0]?.finishReason || 'unknown'})`);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new EmptyResponseError('the model returned invalid JSON');
      }
      const checked = schema.safeParse(parsed);
      if (!checked.success) throw new EmptyResponseError(`output did not match the schema: ${checked.error.issues[0]?.message}`);
      restingUntil.delete(model);
      return checked.data;
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError' || /aborted/i.test(String(err?.message));
      lastError = timedOut && !(err instanceof ApiError) ? new ModelTimeoutError(`${model} timed out`) : err;
      if (!recordFailure('json', model, lastError)) throw lastError;
    }
  }
  throw lastError ?? new Error('no language model is available');
}

/** True for failures worth retrying later: rate limits, overload, timeouts, network trouble. */
export function isTransient(err) {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  return !(err instanceof EmptyResponseError);
}

export function logLlmError(where, err) {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) log.error(`[ai:${where}] Gemini rejected the API key: check GEMINI_API_KEY`);
    else if (err.status === 429) log.warn(`[ai:${where}] Gemini rate limit or quota reached`);
    else log.error(`[ai:${where}] Gemini API error ${err.status}: ${String(err.message).replace(/\s+/g, ' ').slice(0, 200)}`);
  } else log.error(`[ai:${where}] ${err.message}`);
}
