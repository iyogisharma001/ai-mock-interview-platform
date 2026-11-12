// A complete interview session that runs in the browser: same interface as useInterview (the
// Socket.io version), so the Interview page does not care which one it gets. Used whenever the
// backend is offline. Code runs in a Web Worker, state lives in localStorage, and the interviewer
// uses the site's /api/ai function when it is configured, or the rule-based script otherwise.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editorSnapshot, finaliseReport, greeting, heuristicReport, heuristicReview, INTERRUPT_COOLDOWN_SEC, interruptionCandidate,
  interruptionHistoryEvent, metricsOf, REPORT_SCHEMA, REPORT_SYSTEM, reportPrompt, REVIEW_REQUEST_EVENT, REVIEW_SCHEMA,
  REVIEW_SYSTEM, reviewPrompt, ruleBasedReply, runFeedback, systemFor, toInterruption,
} from '../../../server/src/services/interviewerScript.js';
import { aiAvailable, chatStream, structured } from '../standalone/ai.js';
import { getProblem, toPublicProblem } from '../standalone/catalogue.js';
import { runInBrowser } from '../standalone/runner.js';
import { loadInterview, saveInterview, saveReport } from '../standalone/store.js';

const MAX_TERMINAL_LINES = 500;
const REVIEW_DEBOUNCE_MS = 1500;
const HISTORY_MAX = 40;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`);

/** Generate and store the report for a finished local interview. */
export async function writeLocalReport(record, problem) {
  const interview = { ...record, finalCode: record.code };
  const metrics = metricsOf(interview, problem);
  let report = null;
  if (await aiAvailable()) {
    const written = await structured({ system: REPORT_SYSTEM, prompt: reportPrompt(interview, problem, metrics), schema: REPORT_SCHEMA, thinkingBudget: -1, timeoutMs: 58_000 });
    if (written?.scores && written.verdict) report = { ...written, generatedBy: 'llm' };
  }
  return finaliseReport(report ?? heuristicReport(interview, problem, metrics), metrics);
}

export function useLocalInterview(interviewId, voice, getEditorState, enabled) {
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [initialCode, setInitialCode] = useState(null);
  const [messages, setMessages] = useState([]);
  const [terminal, setTerminal] = useState([]);
  const [run, setRun] = useState({ state: 'idle', result: null });
  const [interruption, setInterruption] = useState(null);
  const [reportReady, setReportReady] = useState(false);
  const [hints, setHints] = useState([]);

  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const getEditorRef = useRef(getEditorState);
  getEditorRef.current = getEditorState;
  const rec = useRef(null); // the stored interview record
  const problem = useRef(null); // the full catalogue entry, including hidden tests
  const speaking = useRef(null); // AbortController of the utterance in flight
  const reviewTimer = useRef(null);
  const cooldowns = useRef(new Map());
  const hintCursor = useRef(0);
  const useAi = useRef(false);

  const persist = useCallback(() => rec.current && saveInterview(rec.current), []);
  const pushHistory = (role, content) => {
    rec.current.history.push({ role, content });
    rec.current.history = rec.current.history.slice(-HISTORY_MAX);
  };
  const addTranscript = (entry) => rec.current.transcript.push({ ...entry, at: new Date().toISOString() });
  const ctx = () => ({ candidateName: rec.current.candidateName, language: rec.current.language, problem: problem.current });

  // ---- speech ------------------------------------------------------------------------------
  const speak = useCallback(async ({ kind, event, fallback }) => {
    speaking.current?.abort();
    const controller = new AbortController();
    speaking.current = controller;
    const id = uid();
    let text = '';
    const onDelta = (delta) => {
      text += delta;
      voiceRef.current.streamSay(delta);
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)));
    };
    setMessages((list) => [...list, { id, role: 'interviewer', kind, text: '', streaming: true }]);

    const editor = getEditorRef.current?.();
    const history = [...rec.current.history];
    let aborted = false;
    try {
      if (!useAi.current) throw new Error('rule-based');
      await chatStream({
        system: systemFor(ctx()),
        messages: [...history, { role: 'user', content: event + editorSnapshot(editor && { ...editor, language: rec.current.language }) }],
        onDelta,
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) aborted = true;
      else if (!text) {
        // No AI, or it failed before speaking: the rule-based interviewer answers instead.
        for (const word of fallback().split(/(?<=\s)/)) {
          if (controller.signal.aborted) { aborted = true; break; }
          onDelta(word);
          await new Promise((r) => setTimeout(r, 35));
        }
      }
    }
    if (speaking.current === controller) speaking.current = null;

    text = text.trim();
    if (aborted) voiceRef.current.hush();
    else voiceRef.current.flushSay();
    setMessages((list) => list.flatMap((m) => (m.id !== id ? [m] : text ? [{ ...m, text, streaming: false, aborted }] : [])));
    pushHistory('user', event);
    if (text) {
      pushHistory('assistant', aborted ? `${text} [cut off]` : text);
      addTranscript({ role: 'interviewer', kind, text, meta: aborted ? { aborted: true } : undefined });
    }
    persist();
    return text;
  }, [persist]);

  // ---- load --------------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      const record = loadInterview(interviewId);
      if (!record) {
        setStatus('error');
        setError('This interview was not found in this browser.');
        return;
      }
      let full;
      try {
        full = await getProblem(record.problemSlug);
      } catch {
        full = null;
      }
      if (cancelled) return;
      if (!full) {
        setStatus('error');
        setError('The problem for this interview could not be loaded. Check your connection and reload.');
        return;
      }
      rec.current = record;
      problem.current = full;
      hintCursor.current = 0;
      useAi.current = await aiAvailable();
      if (cancelled) return;
      setSession({
        interview: { id: record.id, candidateName: record.candidateName, language: record.language, status: record.status, startedAt: record.startedAt, reportStatus: record.reportStatus },
        problem: toPublicProblem(full),
        aiMode: useAi.current ? 'llm' : 'rule-based',
        standalone: true,
      });
      setInitialCode(record.code);
      setHints(full.hints.slice(0, record.hintsUsed));
      setMessages(record.transcript.filter((t) => t.role !== 'system').map((t, i) => ({ id: `h${i}`, role: t.role, kind: t.kind, text: t.text, meta: t.meta })));
      setReportReady(record.reportStatus === 'ready');
      setStatus(record.status === 'completed' ? 'ended' : 'live');
      if (record.status === 'active' && record.transcript.length === 0) speak(greeting(ctx()));
    })();
    return () => {
      cancelled = true;
      speaking.current?.abort();
      clearTimeout(reviewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, enabled]);

  // ---- interruptions -----------------------------------------------------------------------
  const review = useCallback(async (trigger) => {
    if (!rec.current || rec.current.status !== 'active') return null;
    const code = rec.current.code;
    const candidate = interruptionCandidate(problem.current, code, rec.current.language);
    if (!candidate) return null;
    const last = cooldowns.current.get(candidate.region) || 0;
    if (Date.now() - last < INTERRUPT_COOLDOWN_SEC * 1000) return null;
    cooldowns.current.set(candidate.region, Date.now());

    let verdict = null;
    if (useAi.current) {
      verdict = await structured({ system: REVIEW_SYSTEM, prompt: reviewPrompt(problem.current, { code, language: rec.current.language }, candidate.analysis), schema: REVIEW_SCHEMA, thinkingBudget: 1024, timeoutMs: 20_000 });
    }
    verdict ??= heuristicReview(problem.current, candidate.analysis);
    const payload = toInterruption(problem.current, code, verdict, candidate.targetRank, trigger, uid());
    if (!payload || rec.current.code !== code) return null; // stale: the candidate kept typing

    speaking.current?.abort();
    voiceRef.current.interruptSay(payload.message);
    setInterruption(payload);
    setMessages((list) => [...list.map((m) => (m.streaming ? { ...m, streaming: false, aborted: true } : m)), { id: payload.id, role: 'interviewer', kind: 'interruption', text: payload.message, meta: payload }]);
    pushHistory('user', interruptionHistoryEvent(payload));
    pushHistory('assistant', payload.message);
    addTranscript({ role: 'interviewer', kind: 'interruption', text: payload.message, meta: { startLine: payload.startLine, endLine: payload.endLine, timeComplexity: payload.timeComplexity, trigger } });
    rec.current.interruptions += 1;
    persist();
    return payload;
  }, [persist]);

  // ---- actions -----------------------------------------------------------------------------
  const sendCode = useCallback((code) => {
    if (!rec.current || rec.current.status !== 'active') return;
    rec.current.code = code;
    persist();
    clearTimeout(reviewTimer.current);
    reviewTimer.current = setTimeout(() => review('auto'), REVIEW_DEBOUNCE_MS);
  }, [persist, review]);

  const runCode = useCallback(async (code) => {
    if (!rec.current || rec.current.status !== 'active') return { ok: false };
    if (typeof code === 'string') rec.current.code = code;
    if (!rec.current.code.trim()) {
      setError('Nothing to run yet.');
      return { ok: false };
    }
    setError('');
    clearTimeout(reviewTimer.current);
    review('pre-run');
    setRun({ state: 'running', result: null });
    setTerminal([]);
    const lines = [];
    const push = (stream, text) => {
      lines.push({ stream, text });
      setTerminal((list) => [...list, { stream, text }].slice(-MAX_TERMINAL_LINES));
    };
    push('system', `$ run ${rec.current.language} in your browser · ${problem.current.testCases.length ? `${problem.current.testCases.length} tests` : 'scratch run'} · 5 s limit`);
    const result = await runInBrowser({ code: rec.current.code, language: rec.current.language, problem: problem.current, onOutput: push });
    rec.current.runs.push({ status: result.status, passed: result.passed, total: result.total, durationMs: result.durationMs, timedOut: result.timedOut, at: new Date().toISOString() });
    persist();
    setRun({ state: 'done', result });
    speak(runFeedback(result));
    return { ok: true };
  }, [persist, review, speak]);

  const say = useCallback((text) => {
    if (!rec.current || rec.current.status !== 'active') return Promise.resolve({ ok: false });
    setMessages((list) => [...list, { id: uid(), role: 'candidate', kind: 'message', text }]);
    addTranscript({ role: 'candidate', kind: 'message', text });
    persist();
    const code = rec.current.code;
    speak({
      kind: 'reply',
      event: text,
      fallback: () => {
        const reply = ruleBasedReply(ctx(), text, code, hintCursor.current);
        if (reply.usedHint) hintCursor.current += 1;
        return reply.text;
      },
    });
    return Promise.resolve({ ok: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, speak]);

  const requestReview = useCallback(async () => {
    const interrupted = await review('manual');
    if (!interrupted) {
      const code = rec.current.code;
      await speak({ kind: 'reply', event: REVIEW_REQUEST_EVENT, fallback: () => ruleBasedReply(ctx(), 'complexity', code).text });
    }
    return { ok: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, speak]);

  const requestHint = useCallback(() => {
    const all = problem.current?.hints || [];
    if (!rec.current || rec.current.status !== 'active') return Promise.resolve({ ok: false });
    if (rec.current.hintsUsed >= all.length) {
      setError(all.length ? 'You have seen every hint for this problem.' : 'This problem has no hints.');
      return Promise.resolve({ ok: false });
    }
    const index = rec.current.hintsUsed;
    rec.current.hintsUsed += 1;
    addTranscript({ role: 'system', kind: 'event', text: `Candidate revealed hint ${index + 1} of ${all.length}: ${all[index]}` });
    pushHistory('user', `[event] The candidate revealed written hint ${index + 1} of ${all.length}: "${all[index]}". Do not repeat it. If they are still stuck, build on it.`);
    persist();
    setHints(all.slice(0, index + 1));
    return Promise.resolve({ ok: true, index, total: all.length, text: all[index] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const end = useCallback(async () => {
    if (!rec.current) return { ok: false };
    clearTimeout(reviewTimer.current);
    speaking.current?.abort();
    const editor = getEditorRef.current?.();
    if (editor) rec.current.code = editor.code;
    if (rec.current.status === 'active') {
      rec.current.status = 'completed';
      rec.current.endedAt = new Date().toISOString();
      rec.current.reportStatus = 'queued';
      persist();
      // Written in the background: the report page waits for it.
      const record = rec.current;
      writeLocalReport(record, problem.current)
        .then((report) => {
          saveReport(record.id, report);
          record.reportStatus = 'ready';
        })
        .catch(() => {
          record.reportStatus = 'failed';
        })
        .finally(() => saveInterview(record));
    }
    setStatus('ended');
    return { ok: true, reportStatus: rec.current.reportStatus };
  }, [persist]);

  return {
    status,
    error,
    session,
    initialCode,
    messages,
    terminal,
    run,
    interruption,
    reportReady,
    hints,
    sendCode,
    runCode,
    say,
    bargeIn: useCallback(() => speaking.current?.abort(), []),
    requestReview,
    requestHint,
    end,
    dismissInterruption: useCallback(() => setInterruption(null), []),
  };
}
