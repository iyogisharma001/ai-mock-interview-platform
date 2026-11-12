// Everything the interviewer says or asks a model, as pure functions with no Node.js dependencies.
// Shared by the server (services/aiAgent.js) and the browser's standalone mode
// (client/src/standalone), so an interview behaves the same wherever it runs.
import { analyzeComplexity, complexityRank } from './complexityAnalyzer.js';

export const PERSONA = `You are a senior staff engineer conducting a live technical interview over voice. The candidate hears your words through text-to-speech and you can see their code editor as they type.

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

export const REVIEW_SYSTEM = `${PERSONA}\n\nYou are watching the candidate type. Decide whether to interrupt them right now. Interrupt only for a real asymptotic problem in code that is substantially written, not for half-typed lines, style, or an approach that is already at the target complexity (sliding window and two-pointer loops are linear even though they nest). When you do interrupt, sound urgent but friendly, point at the exact lines, name the complexity you see, and ask whether it can be optimised before running tests. Do not reveal the optimal technique.`;

export const REPORT_SYSTEM = 'You are a hiring-committee calibrated senior engineer writing the written feedback for a mock technical interview. Be specific and evidence-based: cite line numbers of the final code and moments from the transcript. Be honest about weaknesses; inflated feedback does not help the candidate improve. Score each dimension as an integer from 0 to 10 where 5 is a borderline pass at a mid-level bar.';

export const INTERRUPT_COOLDOWN_SEC = 90;

export const numbered = (code) => String(code || '').split('\n').map((line, i) => `${String(i + 1).padStart(3, ' ')}| ${line}`).join('\n');

export const spoken = (label) => String(label || '')
  .replace(/O\(n\^2\)/gi, 'O of n squared')
  .replace(/O\(n\^3\)/gi, 'O of n cubed')
  .replace(/O\(n log n\)/gi, 'O of n log n')
  .replace(/O\(log n\)/gi, 'O of log n')
  .replace(/O\(2\^n\)/gi, 'exponential')
  .replace(/O\(1\)/gi, 'constant')
  .replace(/O\(n\)/gi, 'O of n');

/** System instruction: persona plus the problem brief. Unchanged for the whole interview. */
export function systemFor({ candidateName, language, problem: p }) {
  const brief = [
    `Candidate name: ${candidateName}`,
    `Problem: ${p.title} (${p.difficulty}, ${p.type})`,
    `Language: ${language}`,
    '',
    'Problem statement shown to the candidate:',
    p.description,
    '',
    p.type === 'coding' ? `Target complexity: ${p.expectedTime} time${p.expectedSpace ? `, ${p.expectedSpace} space` : ''}.` : '',
    p.type === 'coding' && !p.testCases?.length ? 'There is no automated test suite for this problem. The candidate can only run their own code and read its output, so you are the judge of correctness: ask them to walk through examples and edge cases, and state the input format when asked.' : '',
    p.rubric ? `Interviewer notes (never reveal directly): ${p.rubric}` : '',
    p.hints?.length ? `Hints you may give, in escalating order, only when needed:\n${p.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : '',
  ].filter((line) => line !== '').join('\n');
  return `${PERSONA}\n\n${brief}`;
}

/** The live editor appended to the candidate's latest turn. */
export const editorSnapshot = (editor) => (editor ? `\n\n<editor language="${editor.language}" cursor_line="${editor.cursorLine || 1}">\n${numbered(editor.code)}\n</editor>` : '');

// --- Conversation turns: `event` goes to the model, `fallback()` is the rule-based reply -----------

export function greeting({ candidateName, problem: p }) {
  return {
    kind: 'greeting',
    event: `[event] The interview session just started. Greet ${candidateName} briefly, name the problem, and ask them to talk through their initial approach before writing code.`,
    fallback: () => `Hi ${candidateName}, thanks for joining. Today we will work on ${p.title}. Take a moment to read the problem, then talk me through your first idea before you start ${p.type === 'coding' ? 'coding' : 'designing'}.`,
  };
}

const PROBES = [
  'Okay. Before you go further, what is the time complexity of what you have so far, and can you justify it?',
  'That makes sense. Which edge cases are you most worried about, and how does your code handle them?',
  'Good. Walk me through your approach on the first sample input, step by step.',
  'Fair enough. Is there a data structure that would let you avoid repeated work here?',
  'Understood. What would you change if the input were a hundred times larger?',
];

/** Rule-based answer to something the candidate said. `hintIndex` is how many nudges were given. */
export function ruleBasedReply({ problem: p, language }, text, code, hintIndex = 0) {
  const said = text.toLowerCase();
  if (/\b(hint|stuck|help|no idea|clue)\b/.test(said) && p.hints?.length) {
    return { text: `Here is a nudge. ${p.hints[Math.min(hintIndex, p.hints.length - 1)]}`, usedHint: true };
  }
  if (/complexity|big o|runtime|efficien/.test(said) && p.type === 'coding') {
    const analysis = analyzeComplexity(code, language);
    return { text: `From what is in the editor, it looks roughly ${spoken(analysis.estimate)} in time to me. We are aiming for ${spoken(p.expectedTime)}. Do you agree with that estimate, and why?` };
  }
  if (/\b(done|finished|ready|complete)\b/.test(said)) {
    return { text: 'Great. Run the tests, and while they run, tell me the time and space complexity of your final solution.' };
  }
  return { text: PROBES[Math.floor(Math.random() * PROBES.length)] };
}

export function runFeedback(result) {
  if (result.status === 'unavailable') {
    return {
      kind: 'run-feedback',
      event: `[event] The candidate pressed Run, but their ${'C++'} code could not be executed because the code-execution server is offline. Tell them in one sentence that you will review the code by reading it instead, then ask them to walk you through what it would output on the first example.`,
      fallback: () => 'The code runner for C plus plus is offline right now, so let us review it by reading. Walk me through what your code would return on the first example.',
    };
  }
  if (result.mode === 'scratch') {
    const output = (result.stdoutTail || '').slice(-1200);
    return {
      kind: 'run-feedback',
      event: `[event] The candidate ran their code on their own inputs (this problem has no test suite). Exit status: ${result.status} after ${result.durationMs} ms.${result.timedOut ? ' It hit the hard time limit.' : ''}${output ? ` Output (last lines):\n${output}` : ' It printed nothing.'}${result.stderr ? `\nErrors:\n${result.stderr.slice(-600)}` : ''}\nReact in one or two sentences: judge whether the output looks right for the inputs they chose, or ask what they expected. Do not fix the code for them.`,
      fallback: () => {
        if (result.status === 'timeout') return 'That run hit the five second time limit. Is there an infinite loop, or is the approach too slow for that input?';
        if (result.status !== 'completed') return 'That run ended with an error. Read the trace in the terminal and tell me what you think went wrong.';
        return 'Okay, it runs. Tell me which inputs you tried, what you expected, and which edge cases you have not covered yet.';
      },
    };
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
  return {
    kind: 'run-feedback',
    event,
    fallback: () => {
      if (result.status === 'accepted') return `Nice, all ${result.total} tests pass. Now tell me the time and space complexity, and whether you could do better.`;
      if (result.status === 'timeout') return 'That run hit the five second time limit. What does that tell you about the complexity of your approach on large inputs?';
      if (result.status === 'compile_error') return 'The code did not load. Take a look at the error in the terminal and tell me what you think went wrong.';
      if (result.status === 'memory_limit') return 'That run exceeded the memory limit. Where is your solution allocating more than it needs?';
      return `${result.passed} of ${result.total} tests pass. Pick one failing case and trace through your code by hand. Where does it diverge?`;
    },
  };
}

export const REVIEW_REQUEST_EVENT = '[event] The candidate pressed "Review my code". Give a brief, honest assessment of the current code: its time and space complexity and the single most important thing to look at next.';

// --- Interruptions ----------------------------------------------------------------------------

/** Static gate: is there anything worth interrupting for? Returns the analysis and a region key. */
export function interruptionCandidate(problem, code, language) {
  if (problem.type !== 'coding' || !String(code || '').trim()) return null;
  const analysis = analyzeComplexity(code, language);
  const targetRank = complexityRank(problem.expectedTime);
  const suspicious = analysis.findings.length > 0 && (analysis.rank > targetRank || analysis.findings.some((f) => f.confidence === 'low'));
  if (!suspicious) return null;
  const top = analysis.findings[0];
  const region = String(code).split('\n').slice(top.startLine - 1, top.endLine).map((l) => l.trim()).join('\n');
  return { analysis, targetRank, region };
}

export function reviewPrompt(problem, editor, analysis) {
  return `Problem: ${problem.title}\nTarget: ${problem.expectedTime} time${problem.expectedSpace ? `, ${problem.expectedSpace} space` : ''}.\n\n${problem.description}\n\nStatic analysis flagged:\n${analysis.findings.map((f) => `- ${f.detail}`).join('\n') || '- nothing'}\n\n<editor language="${editor.language}">\n${numbered(editor.code)}\n</editor>`;
}

export function heuristicReview(problem, analysis) {
  const finding = analysis.findings.find((f) => f.confidence === 'high');
  if (!finding) return null;
  return {
    should_interrupt: true,
    start_line: finding.startLine,
    end_line: finding.endLine,
    time_complexity: analysis.estimate,
    space_complexity: 'unknown',
    message: `Wait, let's pause here. Look at lines ${finding.startLine} to ${finding.endLine}. Isn't that ${spoken(analysis.estimate)}? We are aiming for ${spoken(problem.expectedTime)}. Can we optimise that before running tests?`,
  };
}

/** Turn a verdict into the interruption shown to the candidate, or null to stay quiet. */
export function toInterruption(problem, code, verdict, targetRank, trigger, id) {
  if (!verdict?.should_interrupt || !verdict.message) return null;
  if (complexityRank(verdict.time_complexity) <= targetRank) return null;
  const lineCount = String(code).split('\n').length;
  const startLine = Math.max(1, Math.min(verdict.start_line, lineCount));
  return {
    id,
    trigger,
    message: verdict.message.trim(),
    startLine,
    endLine: Math.max(startLine, Math.min(verdict.end_line, lineCount)),
    timeComplexity: verdict.time_complexity,
    spaceComplexity: verdict.space_complexity,
    expectedTime: problem.expectedTime,
  };
}

export const interruptionHistoryEvent = (p) => `[event] While the candidate was typing, you noticed lines ${p.startLine}-${p.endLine} are ${p.timeComplexity} and interrupted them.`;

// --- JSON schemas for structured model output (plain JSON Schema, usable anywhere) ----------------

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    should_interrupt: { type: 'boolean', description: 'True only if the code as written is asymptotically worse than the target complexity and a good interviewer would stop the candidate now.' },
    start_line: { type: 'integer', description: 'First line of the offending region, from the numbered editor snapshot.' },
    end_line: { type: 'integer', description: 'Last line of the offending region.' },
    time_complexity: { type: 'string', description: 'Time complexity of the current code, e.g. O(n^2).' },
    space_complexity: { type: 'string', description: 'Space complexity of the current code, e.g. O(1).' },
    message: { type: 'string', description: 'What the interviewer says out loud, one or two sentences, plain spoken English, citing the line numbers. Empty when should_interrupt is false.' },
  },
  required: ['should_interrupt', 'start_line', 'end_line', 'time_complexity', 'space_complexity', 'message'],
};

const score = (what) => ({ type: 'integer', description: `${what}, integer 0-10` });
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire'] },
    summary: { type: 'string', description: 'Three to five sentences an engineering manager could read on its own.' },
    scores: {
      type: 'object',
      properties: {
        correctness: score('Does the final code solve the problem'),
        complexity: score('Algorithmic efficiency relative to the target'),
        communication: score('Clarity of explanation and collaboration'),
        codeQuality: score('Readability, naming, structure, edge cases'),
        problemSolving: score('Approach, decomposition, response to hints and interruptions'),
      },
      required: ['correctness', 'complexity', 'communication', 'codeQuality', 'problemSolving'],
    },
    timeComplexity: { type: 'string' },
    spaceComplexity: { type: 'string' },
    optimalComplexity: { type: 'string', description: 'Best achievable time and space for this problem.' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    codeReview: { type: 'array', items: { type: 'object', properties: { lines: { type: 'string', description: 'e.g. "12-15"' }, comment: { type: 'string' } }, required: ['lines', 'comment'] } },
    nextSteps: { type: 'array', items: { type: 'string' }, description: 'Concrete practice recommendations.' },
  },
  required: ['verdict', 'summary', 'scores', 'timeComplexity', 'spaceComplexity', 'optimalComplexity', 'strengths', 'improvements', 'codeReview', 'nextSteps'],
};

// --- Report -----------------------------------------------------------------------------------

export const clamp = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

/** `interview` needs: startedAt, endedAt, runs, interruptions, hintsUsed, transcript. */
export function metricsOf(interview, problem) {
  const best = interview.runs.reduce((m, r) => Math.max(m, r.passed || 0), 0);
  return {
    durationSec: Math.round((new Date(interview.endedAt || Date.now()) - new Date(interview.startedAt)) / 1000),
    runs: interview.runs.length,
    bestPassed: best,
    totalTests: (problem.testCases || []).length,
    interruptions: interview.interruptions || 0,
    hintsUsed: interview.hintsUsed || 0,
    candidateTurns: interview.transcript.filter((t) => t.role === 'candidate').length,
  };
}

export function reportPrompt(interview, problem, metrics) {
  const transcript = interview.transcript
    .map((t) => `${t.role.toUpperCase()}${t.kind === 'interruption' ? ' (INTERRUPTION)' : ''}: ${t.text}`)
    .join('\n');
  return `Problem: ${problem.title} (${problem.difficulty}, ${problem.type})\nTarget complexity: ${problem.expectedTime} time${problem.expectedSpace ? `, ${problem.expectedSpace} space` : ''}\n\n${problem.description}\n\nObjective metrics: ${JSON.stringify(metrics)}\nTest runs (chronological): ${JSON.stringify(interview.runs.map((r) => ({ status: r.status, passed: r.passed, total: r.total, ms: r.durationMs })))}\n\n<final_code language="${interview.language}">\n${numbered(interview.finalCode)}\n</final_code>\n\n<transcript>\n${transcript || '(the candidate said nothing)'}\n</transcript>`;
}

export function heuristicReport(interview, problem, metrics) {
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
      ? `${interview.candidateName} worked on ${problem.title}, which has no automated test suite, across ${metrics.runs} scratch run(s) and ${metrics.hintsUsed} hint(s). The final solution is estimated at ${analysis.estimate} time against a target of ${problem.expectedTime}. Correctness could not be verified: this report was produced by static heuristics because no AI model was available.`
      : isCoding
      ? `${interview.candidateName} passed ${metrics.bestPassed} of ${metrics.totalTests} tests on ${problem.title} across ${metrics.runs} run(s). The final solution is estimated at ${analysis.estimate} time against a target of ${problem.expectedTime}. The interviewer interrupted ${metrics.interruptions} time(s) for suboptimal patterns. This report was produced by static heuristics because no AI model was available.`
      : `${interview.candidateName} completed the ${problem.title} design discussion with ${metrics.candidateTurns} spoken or typed turns. This report was produced by static heuristics because no AI model was available, so it cannot judge design quality.`,
    timeComplexity: isCoding ? analysis.estimate : 'n/a',
    spaceComplexity: 'not analysed',
    optimalComplexity: isCoding ? `${problem.expectedTime} time${problem.expectedSpace ? `, ${problem.expectedSpace} space` : ''}` : 'n/a',
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

/** Clamp scores and compute the overall score; shared final step for any report. */
export function finaliseReport(report, metrics) {
  for (const k of Object.keys(report.scores)) report.scores[k] = clamp(report.scores[k]);
  const values = Object.values(report.scores);
  report.overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  report.metrics = metrics;
  return report;
}
