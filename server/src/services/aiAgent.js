// Real-time AI interviewer: bridges candidate speech/text and editor state to a streaming LLM,
// decides when to interrupt, and writes the post-interview report.
//
// What the interviewer says lives in interviewerScript.js, shared with the browser's standalone
// mode. This file wires it to Socket.io, Redis state and the model (llm.js).
// Every public function takes `emit(event, payload)` so the transport (Socket.io room) stays out of here.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { appendTranscript } from './interviewService.js';
import * as state from './interviewState.js';
import {
  editorSnapshot, finaliseReport, greeting, heuristicReport, heuristicReview, INTERRUPT_COOLDOWN_SEC, interruptionCandidate,
  interruptionHistoryEvent, metricsOf, REPORT_SYSTEM, reportPrompt, REVIEW_REQUEST_EVENT, REVIEW_SYSTEM, reviewPrompt,
  ruleBasedReply, runFeedback, systemFor, toInterruption,
} from './interviewerScript.js';
import { generateJson, isTransient, llmEnabled, logLlmError as logApiError, streamText } from './llm.js';

export { llmEnabled, llmLabel } from './llm.js';

// Truthy when a language model is configured; otherwise the rule-based interviewer answers.
const client = llmEnabled;

async function editorBlock(ctx) {
  return editorSnapshot(await state.getEditor(ctx.interviewId));
}

// ---------------------------------------------------------------------------------------------
// Streaming speech
// ---------------------------------------------------------------------------------------------

const active = new Map(); // interviewId -> AbortController of the utterance in flight

/** Cut the interviewer off mid-sentence (used when an interruption or a new turn pre-empts). */
export function cancelSpeech(interviewId) {
  active.get(interviewId)?.abort();
}

async function llmStream(ctx, event, onDelta, signal) {
  const history = await state.getHistory(ctx.interviewId);
  await streamText({
    system: systemFor(ctx),
    messages: [...history, { role: 'user', content: event + (await editorBlock(ctx)) }],
    onDelta,
    signal,
  });
}

async function mockStream(text, onDelta, signal) {
  for (const word of text.split(/(?<=\s)/)) {
    if (signal.aborted) throw new Error('aborted');
    onDelta(word);
    await new Promise((r) => setTimeout(r, 35));
  }
}

async function speak(ctx, emit, { event, kind, fallback }) {
  cancelSpeech(ctx.interviewId);
  const controller = new AbortController();
  active.set(ctx.interviewId, controller);

  const id = randomUUID();
  let text = '';
  const onDelta = (delta) => {
    text += delta;
    emit('ai:stream:delta', { id, text: delta });
  };
  emit('ai:stream:start', { id, kind });

  let aborted = false;
  try {
    if (client) await llmStream(ctx, event, onDelta, controller.signal);
    else await mockStream(fallback(), onDelta, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) aborted = true;
    else {
      logApiError('speak', err);
      // Degrade to the rule-based interviewer rather than leaving the candidate in silence.
      if (!text) await mockStream(fallback(), onDelta, controller.signal).catch(() => { aborted = true; });
    }
  } finally {
    if (active.get(ctx.interviewId) === controller) active.delete(ctx.interviewId);
  }

  text = text.trim();
  emit('ai:stream:end', { id, kind, text, aborted });
  await state.pushHistory(ctx.interviewId, 'user', event);
  if (text) {
    await state.pushHistory(ctx.interviewId, 'assistant', aborted ? `${text} [cut off]` : text);
    await appendTranscript(ctx.interviewId, { role: 'interviewer', kind, text, meta: aborted ? { aborted: true } : undefined });
  }
  return text;
}

// ---------------------------------------------------------------------------------------------
// Conversation entry points
// ---------------------------------------------------------------------------------------------

const hintCursor = new Map(); // interviewId -> nudges the rule-based interviewer has given

export function greet(ctx, emit) {
  return speak(ctx, emit, greeting(ctx));
}

export async function respond(ctx, emit, text) {
  const editor = await state.getEditor(ctx.interviewId);
  return speak(ctx, emit, {
    kind: 'reply',
    event: text,
    fallback: () => {
      const n = hintCursor.get(ctx.interviewId) || 0;
      const reply = ruleBasedReply(ctx, text, editor?.code, n);
      if (reply.usedHint) hintCursor.set(ctx.interviewId, n + 1);
      return reply.text;
    },
  });
}

export function requestReview(ctx, emit) {
  return respond(ctx, emit, REVIEW_REQUEST_EVENT);
}

export function commentOnRun(ctx, emit, result) {
  return speak(ctx, emit, runFeedback(result));
}

// ---------------------------------------------------------------------------------------------
// Code review + interruption trigger
// ---------------------------------------------------------------------------------------------

const ReviewSchema = z.object({
  should_interrupt: z.boolean().describe('True only if the code as written is asymptotically worse than the target complexity and a good interviewer would stop the candidate now.'),
  start_line: z.number().int().describe('First line of the offending region, from the numbered editor snapshot.'),
  end_line: z.number().int().describe('Last line of the offending region.'),
  time_complexity: z.string().describe('Time complexity of the current code, e.g. O(n^2).'),
  space_complexity: z.string().describe('Space complexity of the current code, e.g. O(1).'),
  message: z.string().describe('What the interviewer says out loud, one or two sentences, plain spoken English, citing the line numbers. Empty when should_interrupt is false.'),
});

/**
 * Inspect the live editor buffer and, if it contains a suboptimal pattern, cut in.
 * @param {'auto'|'pre-run'|'manual'} trigger
 * @returns the interruption payload, or null if the interviewer stays quiet
 */
export async function reviewCode(ctx, emit, trigger = 'auto') {
  const editor = await state.getEditor(ctx.interviewId);
  const candidate = interruptionCandidate(ctx.problem, editor?.code, editor?.language);
  if (!candidate) return null;

  // Never nag: one interruption per distinct code region per cooldown window (also guards concurrent reviews).
  const fingerprint = createHash('sha1').update(candidate.region).digest('hex').slice(0, 16);
  if (!(await state.acquire(ctx.interviewId, `interrupt:${fingerprint}`, INTERRUPT_COOLDOWN_SEC))) return null;

  let verdict = null;
  if (client) {
    try {
      verdict = await generateJson({
        schema: ReviewSchema,
        thinkingBudget: 1024, // enough to tell an amortised linear loop from a truly quadratic one
        maxOutputTokens: 2048,
        system: REVIEW_SYSTEM,
        prompt: reviewPrompt(ctx.problem, editor, candidate.analysis),
      });
    } catch (err) {
      logApiError('review', err);
    }
  }
  verdict ??= heuristicReview(ctx.problem, candidate.analysis);
  const payload = toInterruption(ctx.problem, editor.code, verdict, candidate.targetRank, trigger, randomUUID());
  if (!payload) return null;

  cancelSpeech(ctx.interviewId); // an interruption pre-empts whatever the interviewer was saying
  emit('ai:interrupt', payload);
  await state.pushHistory(ctx.interviewId, 'user', interruptionHistoryEvent(payload));
  await state.pushHistory(ctx.interviewId, 'assistant', payload.message);
  await appendTranscript(ctx.interviewId, {
    role: 'interviewer',
    kind: 'interruption',
    text: payload.message,
    meta: { startLine: payload.startLine, endLine: payload.endLine, timeComplexity: payload.timeComplexity, trigger },
  });
  return payload;
}

// ---------------------------------------------------------------------------------------------
// Post-interview report (runs inside a BullMQ worker)
// ---------------------------------------------------------------------------------------------

const scoreField = (what) => z.number().int().describe(`${what}, integer 0-10`);
const ReportSchema = z.object({
  verdict: z.enum(['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire']),
  summary: z.string().describe('Three to five sentences an engineering manager could read on its own.'),
  scores: z.object({
    correctness: scoreField('Does the final code solve the problem'),
    complexity: scoreField('Algorithmic efficiency relative to the target'),
    communication: scoreField('Clarity of explanation and collaboration'),
    codeQuality: scoreField('Readability, naming, structure, edge cases'),
    problemSolving: scoreField('Approach, decomposition, response to hints and interruptions'),
  }),
  timeComplexity: z.string(),
  spaceComplexity: z.string(),
  optimalComplexity: z.string().describe('Best achievable time and space for this problem.'),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  codeReview: z.array(z.object({ lines: z.string().describe('e.g. "12-15"'), comment: z.string() })),
  nextSteps: z.array(z.string()).describe('Concrete practice recommendations.'),
});

export async function generateReport({ interview, problem, attempt = 1, maxAttempts = 1 }) {
  const metrics = metricsOf(interview, problem);
  let report = null;

  if (client) {
    try {
      const written = await generateJson({
        schema: ReportSchema,
        thinkingBudget: -1, // the report is the one place depth matters more than speed
        maxOutputTokens: 16384,
        timeoutMs: 90_000,
        system: REPORT_SYSTEM,
        prompt: reportPrompt(interview, problem, metrics),
      });
      report = { ...written, generatedBy: 'llm' };
    } catch (err) {
      logApiError('report', err);
      // Rate limits and outages are worth another try (BullMQ retries with backoff). Anything
      // else, such as a rejected key or an unusable answer, falls back to the heuristic report.
      if (isTransient(err) && attempt < maxAttempts) throw err;
      log.warn('[ai:report] using the heuristic report instead');
    }
  }

  return finaliseReport(report ?? heuristicReport(interview, problem, metrics), metrics);
}
