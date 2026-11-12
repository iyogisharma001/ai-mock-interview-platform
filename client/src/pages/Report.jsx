import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const VERDICT = {
  strong_hire: { label: 'Strong hire', tone: 'text-signal' },
  hire: { label: 'Hire', tone: 'text-signal' },
  lean_hire: { label: 'Lean hire', tone: 'text-note' },
  lean_no_hire: { label: 'Lean no hire', tone: 'text-alarm' },
  no_hire: { label: 'No hire', tone: 'text-fail' },
};

const SCORE_LABELS = {
  correctness: 'Correctness',
  complexity: 'Efficiency',
  communication: 'Communication',
  codeQuality: 'Code quality',
  problemSolving: 'Problem solving',
};

function ScoreBar({ label, value }) {
  const tone = value >= 7 ? 'bg-signal' : value >= 5 ? 'bg-note' : 'bg-alarm';
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm">
      <span className="text-ink-300">{label}</span>
      <div className="h-1.5 rounded-full bg-ink-800" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={value} aria-label={label}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

function List({ title, items, marker, tone }) {
  if (!items?.length) return null;
  return (
    <section>
      <h2 className="text-sm font-medium text-ink-400">{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-100">
            <span className={`shrink-0 ${tone}`}>{marker}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Report() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [interview, setInterview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    api.interview(id).then((data) => !cancelled && setInterview(data)).catch(() => {});

    const poll = async () => {
      try {
        const data = await api.report(id);
        if (cancelled) return;
        setState(data);
        if (data.status === 'queued') timer = setTimeout(poll, 2000);
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  const shell = (children) => (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Whiteboard</Link>
      {children}
    </main>
  );

  if (state.status === 'loading' || state.status === 'queued') {
    return shell(
      <div className="mt-24 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-signal" />
        <h1 className="mt-6 text-xl font-semibold">Writing your feedback</h1>
        <p className="mt-2 text-sm text-ink-400">Reviewing your code, test runs and the conversation. This usually takes under a minute.</p>
      </div>,
    );
  }
  if (state.status === 'none') {
    return shell(<p className="mt-16 text-ink-300">This interview is still in progress. <Link className="text-signal hover:underline" to={`/interview/${id}`}>Return to it</Link> and end the session to get a report.</p>);
  }
  if (state.status !== 'ready') {
    return shell(<p role="alert" className="mt-16 text-fail">{state.message || 'Report generation failed. Please try again later.'}</p>);
  }

  const r = state.report;
  const verdict = VERDICT[r.verdict];
  const minutes = Math.max(1, Math.round((r.metrics?.durationSec || 0) / 60));

  return shell(
    <>
      <header className="mt-8 border-b border-ink-800 pb-8">
        <p className="text-sm text-ink-400">{interview?.candidateName} · {interview?.problem?.title}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className={`text-4xl font-semibold tracking-tight ${verdict.tone}`}>{verdict.label}</h1>
          <div className="text-right">
            <div className="font-mono text-4xl font-semibold tabular-nums">{r.overall.toFixed(1)}<span className="text-lg text-ink-400">/10</span></div>
          </div>
        </div>
        <p className="mt-5 leading-relaxed text-ink-100">{r.summary}</p>
        {r.generatedBy === 'heuristic' && (
          <p className="mt-3 rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-ink-300">
            Generated from static heuristics only. Set GEMINI_API_KEY on the server for a full written review.
          </p>
        )}
      </header>

      <section className="space-y-3 border-b border-ink-800 py-8">
        {Object.entries(SCORE_LABELS).map(([key, label]) => <ScoreBar key={key} label={label} value={r.scores[key]} />)}
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-ink-800 py-8 sm:grid-cols-4">
        {[
          ['Your time', r.timeComplexity],
          ['Your space', r.spaceComplexity],
          ['Tests passed', r.metrics?.totalTests ? `${r.metrics.bestPassed}/${r.metrics.totalTests}` : 'n/a'],
          ['Interruptions', r.metrics?.interruptions ?? 0],
          ['Hints used', r.metrics?.hintsUsed ?? 0],
          ['Duration', `${minutes} min`],
          ['Runs', r.metrics?.runs ?? 0],
          ['Times you spoke', r.metrics?.candidateTurns ?? 0],
        ].map(([term, value]) => (
          <div key={term}>
            <dt className="text-xs text-ink-400">{term}</dt>
            <dd className="mt-1 font-mono text-sm">{value}</dd>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs text-ink-400">Optimal</dt>
          <dd className="mt-1 font-mono text-sm">{r.optimalComplexity}</dd>
        </div>
      </dl>

      <div className="space-y-8 py-8">
        <List title="What went well" items={r.strengths} marker="+" tone="text-signal" />
        <List title="What to work on" items={r.improvements} marker="!" tone="text-alarm" />

        {r.codeReview?.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink-400">Line-by-line notes</h2>
            <ul className="mt-2 divide-y divide-ink-800 border-y border-ink-800">
              {r.codeReview.map((c) => (
                <li key={`${c.lines}-${c.comment}`} className="grid grid-cols-[4.5rem_1fr] gap-3 py-2.5 text-sm">
                  <span className="font-mono text-note">L{c.lines}</span>
                  <span className="text-ink-100">{c.comment}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {interview?.finalCode?.trim() && (
          <section>
            <h2 className="text-sm font-medium text-ink-400">Final submission</h2>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-800 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed">
              {interview.finalCode.split('\n').map((line, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i}><span className="mr-4 inline-block w-6 select-none text-right text-ink-600">{i + 1}</span>{line}</div>
              ))}
            </pre>
          </section>
        )}

        <List title="Practise next" items={r.nextSteps} marker="→" tone="text-note" />
      </div>

      <Link to="/" className="inline-block rounded-md bg-signal px-4 py-2.5 text-sm font-semibold text-ink-950">Start another interview</Link>
    </>,
  );
}
