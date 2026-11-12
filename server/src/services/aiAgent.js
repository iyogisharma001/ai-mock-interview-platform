// Real-time AI interviewer: bridges candidate speech/text and editor state to a streaming LLM,
// decides when to interrupt, and writes the post-interview report.
//
// Every public function takes `emit(event, payload)` so the transport (Socket.io room) stays out of here.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { analyzeComplexity, complexityRank } from './complexityAnalyzer.js';
import { appendTranscript } from './interviewService.js';
import * as state from './interviewState.js';
import { generateJson, isTransient, llmEnabled, logLlmError as logApiError, streamText } from './llm.js';

export { llmEnabled, llmLabel } from './llm.js';

// Truthy when a language model is configured; otherwise the rule-based interviewer answers.
const client = llmEnabled;
const INTERRUPT_COOLDOWN_SEC = 90;

const PERSONA = `You are a senior staff engineer conducting a live technical interview over voice. The candidate hears your words through text-to-speech and you can see their code editor as they type.

How you interview:
- You are warm, direct and economical. A real interviewer speaks in one to three short sentences, then listens.
- You probe reasoning: ask why an approach works, what its time and space complexity is, which edge cases break it, and what trade-offs it makes.
- You never give away the solution. If the candidate is stuck, give the smallest nudge that unblocks them, and escalate only if they stay stuck.
- You track what the candidate has actually written. When you refer to code, cite the line numbers shown in the editor snapshot.
- If the candidate asks you to just tell them the answer, decline kindly and offer a hint instead.
- For system design problems, drive the conversation through requirements, capacity estimates, API, data model, architecture, bottlenecks and trade-offs, one area at a time.

Because your words are spoken aloud:
- Write plain conversational sentences. No markdown, no bullet lists, no code blocks, no emoji.
- Say complexity the way a person would: "O of n squared", "O of n log n".
- Messages in square brackets such as [event] are system notifications about what happened in the session, not something the candidate said. React to them naturally and never read them back.`;

const numbered = (code) => String(code || '').split('\n').map((line, i) => `${String(i + 1).padStart(3, ' ')}| ${line}`).join('\n');

const spoken = (label) => String(label || '')
  .replace(/O\(n\^2\)/gi, 'O of n squared')
  .replace(/O\(n\^3\)/gi, 'O of n cubed')
  .replace(/O\(n log n\)/gi, 'O of n log n')
  .replace(/O\(log n\)/gi, 'O of log n')
  .replace(/O\(2\^n\)/gi, 'exponential')
  .replace(/O\(1\)/gi, 'constant')
  .replace(/O\(n\)/gi, 'O of n');

function systemFor(ctx) {
  const p = ctx.problem;
  const brief = [
    `Candidate name: ${ctx.candidateName}`,
    `Problem: ${p.title} (${p.difficulty}, ${p.type})`,
    `Language: ${ctx.language}`,
    '',
    'Problem statement shown to the candidate:',
    p.description,
    '',
    p.type === 'coding' ? `Target complexity: ${p.expectedTime} time${p.expectedSpace ? `, ${p.expectedSpace} space` : ''}.` : '',
    p.type === 'coding' && !p.testCases?.length ? 'There is no automated test suite for this problem. The candidate can only run their own code and read its output, so you are the judge of correctness: ask them to walk through examples and edge cases, and state the input format when asked.' : '',
    p.rubric ? `Interviewer notes (never reveal directly): ${p.rubric}` : '',
    p.hints?.length ? `Hints you may give, in escalating order, only when needed:\n${p.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
  ].filter((line) => line !== '').join('\n');
  // The system instruction (persona + problem) never changes during an interview; the volatile
  // editor snapshot rides in the last user turn.
  return `${PERSONA}\n\n${brief}`;
}

async function editorBlock(ctx) {
  const editor = await state.getEditor(ctx.interviewId);
  if (!editor) return '';
  return `\n\n<editor language="${editor.language}" cursor_line="${editor.cursorLine}">\n${numbered(editor.code)}\n</editor>`;
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
// Rule-based interviewer (no credentials, or the API is down)
// ---------------------------------------------------------------------------------------------

const PROBES = [
  'Okay. Before you go further, what is the time complexity of what you have so far, and can you justify it?',
  'That makes sense. Which edge cases are you most worried about, and how does your code handle them?',
  'Good. Walk me through your approach on the first sample input, step by step.',
  'Fair enough. Is there a data structure that would let you avoid repeated work here?',
  'Understood. What would you change if the input were a hundred times larger?',
];
const hintCursor = new Map();

function mockReply(ctx, text, editor) {
  const said = text.toLowerCase();
  const p = ctx.problem;
  if (/\b(hint|stuck|help|no idea|clue)\b/.test(said) && p.hints?.length) {
    const n = hintCursor.get(ctx.interviewId) || 0;
    hintCursor.set(ctx.interviewId, n + 1);
    return `Here is a nudge. ${p.hints[Math.min(n, p.hints.length - 1)]}`;
  }
  if (/complexity|big o|runtime|efficien/.test(said) && p.type === 'coding') {
    const analysis = analyzeComplexity(editor?.code, ctx.language);
    return `From what is in the editor, it looks roughly ${spoken(analysis.estimate)} in time to me. We are aiming for ${spoken(p.expectedTime)}. Do you agree with that estimate, and why?`;
  }
  if (/\b(done|finished|ready|complete)\b/.test(said)) {
    return 'Great. Run the tests, and while they run, tell me the time and space complexity of your final solution.';
  }
  return PROBES[Math.floor(Math.random() * PROBES.length)];
}

// ---------------------------------------------------------------------------------------------
// Conversation entry points
// ---------------------------------------------------------------------------------------------

export function greet(ctx, emit) {
  const p = ctx.problem;
  return speak(ctx, emit, {
    kind: 'greeting',
    event: `[event] The interview session just started. Greet ${ctx.candidateName} briefly, name the problem, and ask them to talk through their initial approach before writing code.`,
    fallback: () => `Hi ${ctx.candidateName}, thanks for joining. Today we will work on ${p.title}. Take a moment to read the problem, then talk me through your first idea before you start ${p.type === 'coding' ? 'coding' : 'designing'}.`,
  });
}

export async function respond(ctx, emit, text) {
  const editor = await state.getEditor(ctx.interviewId);
  return speak(ctx, emit, { kind: 'reply', event: text, fallback: () => mockReply(ctx, text, editor) });
}

export function commentOnRun(ctx, emit, result) {
  if (result.mode === 'scratch') {
    const output = (result.stdoutTail || '').slice(-1200);
    return speak(ctx, emit, {
      kind: 'run-feedback',
      event: `[event] The candidate ran their code on their own inputs (this problem has no test suite). Exit status: ${result.status} after ${result.durationMs} ms.${result.timedOut ? ' It hit the hard time limit.' : ''}${output ? ` Output (last lines):\n${output}` : ' It printed nothing.'}${result.stderr ? `\nErrors:\n${result.stderr.slice(-600)}` : ''}\nReact in one or two sentences: judge whether the output looks right for the inputs they chose, or ask what they expected. Do not fix the code for them.`,
      fallback: () => {
        if (result.status === 'timeout') return 'That run hit the five second time limit. Is there an infinite loop, or is the approach too slow for that input?';
        if (result.status !== 'completed') return 'That run ended with an error. Read the trace in the terminal and tell me what you think went wrong.';
        return 'Okay, it runs. Tell me which inputs you tried, what you expected, and which edge cases you have not covered yet.';
      },
    });
  }
  const failing = result.results.filter((r) => !r.passed && !r.hidden).slice(0, 2)
    .map((r) => `test ${r.index + 1}: input ${r.input}, expected ${r.expected}, got ${r.actual ?? r.status}${r.error ? ` (${r.error.split('\n').filter(Boolean).pop()})` : ''}`);
  const hiddenFails = result.results.filter((r) => !r.passed && r.hidden).length;
  const event = [
    `[event] The candidate ran the test suite. Status: ${result.status}. Passed ${result.passed} of ${result.total} in ${result.durationMs} ms.`,
    result.timedOut ? `The run hit the ${result.limits.timeoutMs} ms hard time limit, which usually means the algorithm is too slow or loops forever.` : '',
    result.error ? `Load error: ${result.error}` : '',
    failing.length ? `Visible failures: ${failing.join('; ')}` : '',
    hiddenFails ? `${hiddenFails} hidden test(s) failed. Do not reveal hidden inputs.` : '',
    'React in one or two sentences. Do not fix the code for them.',
  ].filter(Boolean).join(' ');

  return speak(ctx, emit, {
    kind: 'run-feedback',
    event,
    fallback: () => {
      if (result.status === 'accepted') return `Nice, all ${result.total} tests pass. Now tell me the time and space complexity, and whether you could do better.`;
      if (result.status === 'timeout') return 'That run hit the five second time limit. What does that tell you about the complexity of your approach on large inputs?';
      if (result.status === 'compile_error') return 'The code did not load. Take a look at the error in the terminal and tell me what you think went wrong.';
      if (result.status === 'memory_limit') return 'That run exceeded the memory limit. Where is your solution allocating more than it needs?';
      return `${result.passed} of ${result.total} tests pass. Pick one failing case and trace through your code by hand. Where does it diverge?`;
    },
  });
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

async function llmReview(ctx, editor, analysis) {
  const p = ctx.problem;
  return generateJson({
    schema: ReviewSchema,
    thinkingBudget: 1024, // enough to tell an amortised linear loop from a truly quadratic one
    maxOutputTokens: 2048,
    system: `${PERSONA}\n\nYou are watching the candidate type. Decide whether to interrupt them right now. Interrupt only for a real asymptotic problem in code that is substantially written, not for half-typed lines, style, or an approach that is already at the target complexity (sliding window and two-pointer loops are linear even though they nest). When you do interrupt, sound urgent but friendly, point at the exact lines, name the complexity you see, and ask whether it can be optimised before running tests. Do not reveal the optimal technique.`,
    prompt: `Problem: ${p.title}\nTarget: ${p.expectedTime} time${p.expectedSpace ? `, ${p.expectedSpace} space` : ''}.\n\n${p.description}\n\nStatic analysis flagged:\n${analysis.findings.map((f) => `- ${f.detail}`).join('\n') || '- nothing'}\n\n<editor language="${editor.language}">\n${numbered(editor.code)}\n</editor>`,
  });
}

function heuristicReview(ctx, analysis) {
  const finding = analysis.findings.find((f) => f.confidence === 'high');
  if (!finding) return null;
  return {
    should_interrupt: true,
    start_line: finding.startLine,
    end_line: finding.endLine,
    time_complexity: analysis.estimate,
    space_complexity: 'unknown',
    message: `Wait, let's pause here. Look at lines ${finding.startLine} to ${finding.endLine}. Isn't that ${spoken(analysis.estimate)}? We are aiming for ${spoken(ctx.problem.expectedTime)}. Can we optimise that before running tests?`,
  };
}

/**
 * Inspect the live editor buffer and, if it contains a suboptimal pattern, cut in.
 * @param {'auto'|'pre-run'|'manual'} trigger
 * @returns the interruption payload, or null if the interviewer stays quiet
 */
export async function reviewCode(ctx, emit, trigger = 'auto') {
  if (ctx.problem.type !== 'coding') return null;
  const editor = await state.getEditor(ctx.interviewId);
  if (!editor?.code?.trim()) return null;

  const analysis = analyzeComplexity(editor.code, editor.language);
  const targetRank = complexityRank(ctx.problem.expectedTime);
  // Cheap gate: only spend an LLM call when static analysis sees something worse than the target.
  const suspicious = analysis.findings.length > 0 && (analysis.rank > targetRank || analysis.findings.some((f) => f.confidence === 'low'));
  if (!suspicious) return null;

  // Never nag: one interruption per distinct code region per cooldown window (also guards concurrent reviews).
  const lines = editor.code.split('\n');
  const top = analysis.findings[0];
  const region = lines.slice(top.startLine - 1, top.endLine).map((l) => l.trim()).join('\n');
  const fingerprint = createHash('sha1').update(region).digest('hex').slice(0, 16);
  if (!(await state.acquire(ctx.interviewId, `interrupt:${fingerprint}`, INTERRUPT_COOLDOWN_SEC))) return null;

  let verdict = null;
  if (client) {
    try {
      verdict = await llmReview(ctx, editor, analysis);
    } catch (err) {
      logApiError('review', err);
    }
  }
  verdict ??= heuristicReview(ctx, analysis);
  if (!verdict?.should_interrupt || !verdict.message) return null;
  if (complexityRank(verdict.time_complexity) <= targetRank) return null;

  const startLine = Math.max(1, Math.min(verdict.start_line, lines.length));
  const payload = {
    id: randomUUID(),
    trigger,
    message: verdict.message.trim(),
    startLine,
    endLine: Math.max(startLine, Math.min(verdict.end_line, lines.length)),
    timeComplexity: verdict.time_complexity,
    spaceComplexity: verdict.space_complexity,
    expectedTime: ctx.problem.expectedTime,
  };

  cancelSpeech(ctx.interviewId); // an interruption pre-empts whatever the interviewer was saying
  emit('ai:interrupt', payload);
  await state.pushHistory(ctx.interviewId, 'user', `[event] While the candidate was typing, you noticed lines ${payload.startLine}-${payload.endLine} are ${payload.timeComplexity} and interrupted them.`);
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

const clamp = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

function metricsOf(interview, problem) {
  const best = interview.runs.reduce((m, r) => Math.max(m, r.passed || 0), 0);
  return {
    durationSec: Math.round(((interview.endedAt || new Date()) - interview.startedAt) / 1000),
    runs: interview.runs.length,
    bestPassed: best,
    totalTests: problem.testCases.length,
    interruptions: interview.interruptions,
    hintsUsed: interview.hintsUsed || 0,
    candidateTurns: interview.transcript.filter((t) => t.role === 'candidate').length,
  };
}

function heuristicReport(interview, problem, metrics) {
  const analysis = analyzeComplexity(interview.finalCode, interview.language);
  const isCoding = problem.type === 'coding';
  const hasTests = metrics.totalTests > 0;
  // Without a test suite the heuristics cannot judge correctness, so it stays neutral.
  const passRate = hasTests ? metrics.bestPassed / metrics.totalTests : 0.5;
  const optimal = analysis.rank <= complexityRank(problem.expectedTime);
  const scores = {
    correctness: clamp(isCoding ? passRate * 10 : 5),
    complexity: clamp(isCoding ? (optimal ? 9 : 4) - Math.min(metrics.interruptions, 2) : 5),
    communication: clamp(3 + Math.min(metrics.candidateTurns, 7)),
    codeQuality: clamp(interview.finalCode.trim() ? 6 : 1),
    problemSolving: clamp(4 + passRate * 4 + (metrics.runs > 0 ? 1 : 0) - Math.min(metrics.interruptions, 2) - Math.min(metrics.hintsUsed, 2)),
  };
  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  return {
    generatedBy: 'heuristic',
    verdict: overall >= 8.5 ? 'strong_hire' : overall >= 7 ? 'hire' : overall >= 6 ? 'lean_hire' : overall >= 4.5 ? 'lean_no_hire' : 'no_hire',
    scores,
    summary: isCoding && !hasTests
      ? `${interview.candidateName} worked on ${problem.title}, which has no automated test suite, across ${metrics.runs} scratch run(s) and ${metrics.hintsUsed} hint(s). The final solution is estimated at ${analysis.estimate} time against a target of ${problem.expectedTime}. Correctness could not be verified: this report was produced by static heuristics because no LLM was configured.`
      : isCoding
      ? `${interview.candidateName} passed ${metrics.bestPassed} of ${metrics.totalTests} tests on ${problem.title} across ${metrics.runs} run(s). The final solution is estimated at ${analysis.estimate} time against a target of ${problem.expectedTime}. The interviewer interrupted ${metrics.interruptions} time(s) for suboptimal patterns. This report was produced by static heuristics because no LLM was configured.`
      : `${interview.candidateName} completed the ${problem.title} design discussion with ${metrics.candidateTurns} spoken or typed turns. This report was produced by static heuristics because no LLM was configured, so it cannot judge design quality.`,
    timeComplexity: isCoding ? analysis.estimate : 'n/a',
    spaceComplexity: 'not analysed',
    optimalComplexity: isCoding ? `${problem.expectedTime} time, ${problem.expectedSpace} space` : 'n/a',
    strengths: [
      hasTests && passRate === 1 ? 'All tests pass, including hidden cases.' : null,
      optimal && isCoding ? 'Final solution meets the target time complexity.' : null,
      metrics.candidateTurns >= 5 ? 'Communicated consistently throughout the session.' : null,
    ].filter(Boolean),
    improvements: [
      isCoding && hasTests && passRate < 1 ? `${metrics.totalTests - metrics.bestPassed} test(s) still failing: revisit edge cases.` : null,
      metrics.hintsUsed >= 2 ? `Needed ${metrics.hintsUsed} hints: practise this topic until the first idea comes unprompted.` : null,
      isCoding && !optimal ? `Solution is ${analysis.estimate}; the expected approach is ${problem.expectedTime}.` : null,
      metrics.candidateTurns < 3 ? 'Think out loud more: the interviewer had little insight into your reasoning.' : null,
      isCoding && metrics.runs === 0 ? 'Code was never run.' : null,
    ].filter(Boolean),
    codeReview: analysis.findings.map((f) => ({ lines: `${f.startLine}-${f.endLine}`, comment: f.detail })),
    nextSteps: ['Re-solve this problem from scratch aiming for the target complexity.', 'Practise stating complexity before writing code.'],
  };
}

export async function generateReport({ interview, problem, attempt = 1, maxAttempts = 1 }) {
  const metrics = metricsOf(interview, problem);
  let report = null;

  if (client) {
    const transcript = interview.transcript
      .map((t) => `${t.role.toUpperCase()}${t.kind === 'interruption' ? ' (INTERRUPTION)' : ''}: ${t.text}`)
      .join('\n');
    try {
      const written = await generateJson({
        schema: ReportSchema,
        thinkingBudget: -1, // the report is the one place depth matters more than speed
        maxOutputTokens: 16384,
        timeoutMs: 90_000,
        system: 'You are a hiring-committee calibrated senior engineer writing the written feedback for a mock technical interview. Be specific and evidence-based: cite line numbers of the final code and moments from the transcript. Be honest about weaknesses; inflated feedback does not help the candidate improve. Score each dimension as an integer from 0 to 10 where 5 is a borderline pass at a mid-level bar.',
        prompt: `Problem: ${problem.title} (${problem.difficulty}, ${problem.type})\nTarget complexity: ${problem.expectedTime} time${problem.expectedSpace ? `, ${problem.expectedSpace} space` : ''}\n\n${problem.description}\n\nObjective metrics: ${JSON.stringify(metrics)}\nTest runs (chronological): ${JSON.stringify(interview.runs.map((r) => ({ status: r.status, passed: r.passed, total: r.total, ms: r.durationMs })))}\n\n<final_code language="${interview.language}">\n${numbered(interview.finalCode)}\n</final_code>\n\n<transcript>\n${transcript || '(the candidate said nothing)'}\n</transcript>`,
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

  report ??= heuristicReport(interview, problem, metrics);
  for (const k of Object.keys(report.scores)) report.scores[k] = clamp(report.scores[k]);
  const values = Object.values(report.scores);
  report.overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  report.metrics = metrics;
  return report;
}
