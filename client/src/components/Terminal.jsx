import { useEffect, useRef } from 'react';

const STATUS = {
  accepted: { label: 'Accepted', tone: 'text-signal' },
  completed: { label: 'Finished', tone: 'text-signal' },
  wrong_answer: { label: 'Wrong answer', tone: 'text-fail' },
  runtime_error: { label: 'Runtime error', tone: 'text-fail' },
  compile_error: { label: 'Compile or load error', tone: 'text-fail' },
  timeout: { label: 'Time limit exceeded', tone: 'text-alarm' },
  memory_limit: { label: 'Memory limit exceeded', tone: 'text-alarm' },
};

const STREAM_TONE = { stdout: 'text-ink-300', stderr: 'text-fail', system: 'text-ink-400' };

function TestRow({ test }) {
  const mark = test.passed ? '✓' : test.status === 'timeout' ? '◷' : '✗';
  return (
    <div className="border-t border-ink-800 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className={test.passed ? 'text-signal' : 'text-fail'}>{mark}</span>
        <span className="text-ink-100">Test {test.index + 1}{test.hidden ? ' · hidden' : ''}</span>
        <span className="text-ink-400">{test.status.replace('_', ' ')}</span>
        {test.ms != null && <span className="ml-auto text-ink-400">{test.ms.toFixed(2)} ms</span>}
      </div>
      {!test.hidden && !test.passed && (
        <div className="mt-1 grid grid-cols-[5rem_1fr] gap-x-2 pl-5 text-ink-300">
          <span className="text-ink-400">input</span><span className="break-all">{test.input}</span>
          <span className="text-ink-400">expected</span><span className="break-all">{test.expected}</span>
          {test.actual !== undefined && <><span className="text-ink-400">got</span><span className="break-all text-fail">{test.actual}</span></>}
          {test.error && <><span className="text-ink-400">error</span><pre className="whitespace-pre-wrap break-all text-fail">{test.error}</pre></>}
          {test.stdout && <><span className="text-ink-400">stdout</span><pre className="whitespace-pre-wrap break-all">{test.stdout}</pre></>}
        </div>
      )}
    </div>
  );
}

export default function Terminal({ lines, run }) {
  const end = useRef(null);
  // Braces matter: scrollIntoView returns a Promise in newer browsers, and effects may only return a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length, run.state]);

  const result = run.result;
  const status = result ? STATUS[result.status] || { label: result.status, tone: 'text-ink-100' } : null;

  return (
    <div className="h-full overflow-y-auto bg-ink-950 px-4 py-3 font-mono text-[12.5px] leading-relaxed" aria-live="polite">
      {lines.length === 0 && run.state === 'idle' && (
        <p className="text-ink-400">Run your code to execute it in an isolated container. Output appears here.</p>
      )}
      {lines.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className={`whitespace-pre-wrap break-all ${STREAM_TONE[line.stream] || 'text-ink-300'}`}>{line.text}</div>
      ))}
      {run.state === 'running' && <div className="mt-1 animate-pulse text-ink-400">running…</div>}

      {result && (
        <div className="mt-3">
          <div className="flex items-baseline gap-3 pb-1.5">
            <span className={`text-sm font-semibold ${status.tone}`}>{status.label}</span>
            <span className="text-ink-300">{result.mode === 'scratch' ? `exit code ${result.exitCode ?? 'n/a'}` : `${result.passed}/${result.total} passed`}</span>
            <span className="ml-auto text-ink-400">{result.durationMs} ms total</span>
          </div>
          {result.error && <pre className="whitespace-pre-wrap pb-2 text-fail">{result.error}</pre>}
          {result.results.map((test) => <TestRow key={test.index} test={test} />)}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
