import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CodeEditor from '../components/CodeEditor.jsx';
import InterviewerPanel from '../components/InterviewerPanel.jsx';
import Terminal from '../components/Terminal.jsx';
import { useInterview } from '../hooks/useInterview.js';
import { useSpeech } from '../hooks/useSpeech.js';
import { languageLabel } from '../lib/api.js';

function useElapsed(startedAt, running) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return '00:00';
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Interview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const handlers = useRef({});

  const voice = useSpeech({
    onUtterance: (text) => handlers.current.say?.(text, true),
    onBargeIn: () => handlers.current.bargeIn?.(),
  });
  const iv = useInterview(id, voice, () => {
    const editor = editorRef.current;
    return editor ? { code: editor.getValue(), cursorLine: editor.getPosition()?.lineNumber || 1 } : null;
  });
  handlers.current = { say: iv.say, bargeIn: iv.bargeIn };

  const [highlight, setHighlight] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const live = iv.status === 'live';
  const elapsed = useElapsed(iv.session?.interview.startedAt, live);
  const isCoding = iv.session?.problem.type === 'coding';

  // A fresh interruption lights up the offending lines.
  useEffect(() => {
    if (iv.interruption) setHighlight({ startLine: iv.interruption.startLine, endLine: iv.interruption.endLine, key: iv.interruption.id });
  }, [iv.interruption]);

  const handleChange = useCallback((code, cursorLine) => {
    iv.sendCode(code, cursorLine);
    setHighlight(null); // the candidate is responding to the feedback
  }, [iv.sendCode]);

  const run = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || iv.run.state === 'running') return;
    iv.runCode(editor.getValue(), editor.getPosition()?.lineNumber || 1);
  }, [iv.runCode, iv.run.state]);

  // Ctrl/Cmd + Enter runs the tests.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && live && isCoding) {
        event.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, live, isCoding]);

  const end = async () => {
    setConfirmEnd(false);
    voice.stopListening();
    voice.hush();
    await iv.end();
    navigate(`/report/${id}`);
  };

  if (iv.status === 'error') {
    return (
      <main className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-medium">{iv.error}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-signal hover:underline">Back to problems</Link>
        </div>
      </main>
    );
  }
  if (!iv.session || iv.initialCode === null) {
    return <main className="grid h-full place-items-center text-sm text-ink-400">Joining interview…</main>;
  }

  const { problem, interview, aiMode } = iv.session;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-900 px-4">
        <Link to="/" className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Whiteboard</Link>
        <span className="h-4 w-px bg-ink-700" />
        <h1 className="min-w-0 truncate text-sm font-medium">{problem.title}</h1>
        <span className="rounded border border-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300">{languageLabel(interview.language)}</span>

        <div className="ml-auto flex items-center gap-2">
          {iv.error && <span role="alert" className="max-w-64 truncate text-xs text-fail">{iv.error}</span>}
          <span className={`font-mono text-sm tabular-nums ${live ? 'text-ink-100' : 'text-ink-400'}`} aria-label="Elapsed time">{elapsed}</span>
          {live && isCoding && (
            <>
              <button type="button" onClick={iv.requestReview} className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-600 hover:text-ink-100">
                Review my code
              </button>
              <button type="button" onClick={run} disabled={iv.run.state === 'running'} title="Ctrl + Enter" className="rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-ink-950 disabled:opacity-50">
                {iv.run.state === 'running' ? 'Running…' : problem.hasTests ? 'Run tests' : 'Run code'}
              </button>
            </>
          )}
          {live ? (
            <button type="button" onClick={() => setConfirmEnd(true)} className="rounded-md border border-fail/50 px-3 py-1.5 text-xs text-fail hover:bg-fail/10">
              End interview
            </button>
          ) : (
            <Link to={`/report/${id}`} className="rounded-md bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-950">View report</Link>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <section className="hidden min-h-0 overflow-y-auto border-r border-ink-800 bg-ink-900 p-5 lg:block">
          <div className="flex items-center gap-2 text-xs">
            <span className="capitalize text-note">{problem.difficulty}</span>
            <span className="text-ink-400">{problem.topic || problem.tags.join(' · ')}</span>
            {problem.sheetSection && <span className="truncate text-ink-400">· {problem.sheetSection}</span>}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{problem.title}</h2>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-300">{problem.description}</div>
          {isCoding && (
            <p className="mt-6 border-t border-ink-800 pt-4 text-xs text-ink-400">
              {problem.hasTests ? (
                <>{problem.totalTests} tests, {problem.totalTests - problem.sampleTests.length} hidden. Implement <code className="font-mono text-ink-100">{problem.functionName[interview.language]}</code>.</>
              ) : (
                <>No test suite. Run code executes your file as written, so call your solution with your own inputs and print the result.</>
              )}
            </p>
          )}

          {problem.hintCount > 0 && (
            <div className="mt-6 border-t border-ink-800 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Hints</h3>
                <span className="font-mono text-xs text-ink-400">{iv.hints.length}/{problem.hintCount} used</span>
              </div>
              <ol className="mt-2 space-y-2">
                {iv.hints.map((hint, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i} className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-100">
                    <span className="mr-2 font-mono text-xs text-note">{i + 1}</span>{hint}
                  </li>
                ))}
              </ol>
              {live && iv.hints.length < problem.hintCount && (
                <button type="button" onClick={iv.requestHint} className="mt-2 w-full rounded-md border border-ink-700 py-2 text-xs text-ink-300 hover:border-ink-600 hover:text-ink-100">
                  {iv.hints.length ? 'Show the next hint' : 'Show a hint'}
                </button>
              )}
              <p className="mt-2 text-xs text-ink-400">Hints get stronger in order, and each one you reveal is noted in your report.</p>
            </div>
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col">
          {iv.interruption && highlight && (
            <div role="alert" className="flex items-center gap-3 border-b border-alarm/40 bg-alarm-dim px-4 py-2 text-sm">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-alarm">Hold on</span>
              <span className="min-w-0 flex-1 truncate text-ink-100">
                Lines {iv.interruption.startLine}–{iv.interruption.endLine} look like {iv.interruption.timeComplexity}; target is {iv.interruption.expectedTime}.
              </span>
              <button type="button" onClick={() => { iv.dismissInterruption(); setHighlight(null); }} className="text-xs text-ink-300 hover:text-ink-100">Dismiss</button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <CodeEditor
              language={interview.language}
              initialValue={iv.initialCode}
              readOnly={!live}
              highlight={highlight}
              onChange={handleChange}
              editorRef={editorRef}
            />
          </div>
          {isCoding && (
            <div className="h-[34%] min-h-36 shrink-0 border-t border-ink-800">
              <div className="flex h-8 items-center border-b border-ink-800 bg-ink-900 px-4 font-mono text-[11px] uppercase tracking-wider text-ink-400">Terminal</div>
              <div className="h-[calc(100%-2rem)]"><Terminal lines={iv.terminal} run={iv.run} /></div>
            </div>
          )}
        </section>

        <div className="min-h-0 border-t border-ink-800 lg:border-l lg:border-t-0">
          <InterviewerPanel
            messages={iv.messages}
            voice={voice}
            aiMode={aiMode}
            disabled={!live}
            onSend={iv.say}
            onJump={(meta) => setHighlight({ startLine: meta.startLine, endLine: meta.endLine, key: Date.now() })}
          />
        </div>
      </div>

      {confirmEnd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 px-6" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div className="w-full max-w-sm rounded-xl border border-ink-700 bg-ink-900 p-5">
            <h2 id="end-title" className="text-base font-semibold">End the interview?</h2>
            <p className="mt-2 text-sm text-ink-300">Your code is locked and the feedback report starts generating. You can't resume this session.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmEnd(false)} className="rounded-md border border-ink-700 px-3 py-1.5 text-sm text-ink-300 hover:text-ink-100">Keep going</button>
              <button type="button" onClick={end} className="rounded-md bg-fail px-3 py-1.5 text-sm font-semibold text-ink-950">End and get report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
