import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, LANGUAGES } from '../lib/api.js';

const DIFFICULTY = { easy: 'text-signal', medium: 'text-note', hard: 'text-alarm' };
const PAGE_SIZE = 40;

const selectClass = 'rounded-md border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm text-ink-100 focus:border-signal focus:outline-none';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-signal bg-signal-dim text-signal' : 'border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100'}`}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ q: '', difficulty: '', topic: '', sheet: '', tests: '' });
  const [search, setSearch] = useState('');
  const [list, setList] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('candidateName') || '');
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language');
    return LANGUAGES[saved] ? saved : 'python';
  });
  const [selected, setSelected] = useState(null);
  const [starting, setStarting] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    api.problemMeta().then(setMeta).catch((err) => {
      setError(err.message);
      setOffline(Boolean(err.unreachable));
    });
  }, []);

  // While the server is unreachable, keep trying quietly: the page heals itself when it returns.
  useEffect(() => {
    if (!offline) return undefined;
    const timer = setInterval(async () => {
      try {
        setMeta(await api.problemMeta());
        setOffline(false);
        setError('');
        load(1, false);
      } catch {
        /* still down: try again on the next tick */
      }
    }, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  // Debounce typing so the list is not refetched on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() })), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = async (page, append) => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    try {
      const data = await api.problems({ ...filters, page, limit: PAGE_SIZE });
      if (requestId.current !== id) return; // a newer request superseded this one
      setList((prev) => (append ? { ...data, items: [...prev.items, ...data.items] } : data));
      if (!append) setSelected((current) => current && data.items.some((p) => p.slug === current.slug) ? current : data.items[0] || null);
      setError('');
    } catch (err) {
      if (requestId.current === id) {
        setError(err.message);
        setOffline(Boolean(err.unreachable));
      }
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  };

  useEffect(() => {
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value }));
  const filtersActive = Object.values(filters).some(Boolean);

  const surprise = async () => {
    if (!list.total) return;
    const index = Math.floor(Math.random() * list.total);
    const data = await api.problems({ ...filters, page: index + 1, limit: 1 });
    if (data.items[0]) setSelected(data.items[0]);
  };

  const start = async (event) => {
    event.preventDefault();
    if (!name.trim() || !selected) return;
    setStarting(true);
    setError('');
    try {
      localStorage.setItem('candidateName', name.trim());
      localStorage.setItem('language', language);
      const { id } = await api.createInterview({ candidateName: name.trim(), problemSlug: selected.slug, language });
      navigate(`/interview/${id}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  };

  let lastSection = null;

  return (
    <main className="mx-auto grid min-h-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:py-16">
      <section className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Whiteboard</p>
        <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
          A mock interview that talks back.
        </h1>
        <p className="mt-4 max-w-lg text-ink-300">
          Solve a problem out loud while an AI interviewer watches your editor, cuts in when your approach is too slow, runs your code in a sandbox and writes up honest feedback.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          <Chip active={!filters.sheet && !filters.tests} onClick={() => setFilters((f) => ({ ...f, sheet: '', tests: '' }))}>
            All problems{meta ? ` · ${meta.total}` : ''}
          </Chip>
          {meta?.sheets.map((s) => (
            <Chip key={s.id} active={filters.sheet === s.id} onClick={() => setFilter('sheet', s.id)}>{s.name} · {s.count}</Chip>
          ))}
          <Chip active={filters.tests === '1'} onClick={() => setFilter('tests', '1')}>With test suite{meta ? ` · ${meta.withTests}` : ''}</Chip>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            aria-label="Search problems"
            className="min-w-48 flex-1 rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-signal focus:outline-none"
          />
          <select aria-label="Topic" value={filters.topic} onChange={(e) => setFilters((f) => ({ ...f, topic: e.target.value }))} className={selectClass}>
            <option value="">All topics</option>
            {meta?.topics.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
          <select aria-label="Difficulty" value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))} className={selectClass}>
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
          <span aria-live="polite">{loading && !list.items.length ? 'Loading problems…' : `${list.total} problem${list.total === 1 ? '' : 's'}`}</span>
          <span className="flex gap-4">
            {filtersActive && (
              <button type="button" className="hover:text-ink-100" onClick={() => { setSearch(''); setFilters({ q: '', difficulty: '', topic: '', sheet: '', tests: '' }); }}>
                Clear filters
              </button>
            )}
            <button type="button" className="text-signal hover:underline disabled:opacity-40" disabled={!list.total} onClick={surprise}>Surprise me</button>
          </span>
        </div>

        <ul className="mt-2 border-y border-ink-800">
          {list.items.map((p) => {
            const header = p.sheetSection && p.sheetSection !== lastSection ? p.sheetSection : null;
            if (p.sheetSection) lastSection = p.sheetSection;
            const active = selected?.slug === p.slug;
            return (
              <li key={p.slug} className="border-t border-ink-800 first:border-t-0">
                {header && <div className="bg-ink-900 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-400">{header}</div>}
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${active ? 'bg-ink-850' : 'hover:bg-ink-900'}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-signal' : 'bg-ink-700'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-ink-400">{p.topic}</span>
                  </span>
                  {p.hasTests && <span className="hidden rounded border border-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300 sm:inline">Tests</span>}
                  {p.type === 'system-design' && <span className="rounded border border-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300">Design</span>}
                  <span className={`w-14 shrink-0 text-right text-xs capitalize ${DIFFICULTY[p.difficulty]}`}>{p.difficulty}</span>
                </button>
              </li>
            );
          })}
          {!loading && list.items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-ink-400">
              {offline ? 'Waiting for the interview server. This page will load the problems by itself when it is back.' : 'No problems match those filters.'}
            </li>
          )}
        </ul>

        {list.page < list.pages && (
          <button
            type="button"
            disabled={loading}
            onClick={() => load(list.page + 1, true)}
            className="mt-4 w-full rounded-md border border-ink-700 py-2.5 text-sm text-ink-300 hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
          >
            {loading ? 'Loading…' : `Show more (${list.total - list.items.length} left)`}
          </button>
        )}
      </section>

      <form onSubmit={start} className="h-fit rounded-xl border border-ink-800 bg-ink-900 p-5 lg:sticky lg:top-10">
        <h2 className="text-lg font-semibold">Start a session</h2>

        <div className="mt-4 rounded-md border border-ink-800 bg-ink-950 px-3 py-2.5">
          <div className="text-xs text-ink-400">Problem</div>
          {selected ? (
            <>
              <div className="mt-0.5 text-sm font-medium">{selected.title}</div>
              <div className="mt-0.5 text-xs text-ink-400">
                <span className={`capitalize ${DIFFICULTY[selected.difficulty]}`}>{selected.difficulty}</span> · {selected.topic} · {selected.type === 'system-design' ? 'design discussion' : selected.hasTests ? 'graded by tests' : 'run your own inputs'}
              </div>
            </>
          ) : <div className="mt-0.5 text-sm text-ink-400">Pick one from the list</div>}
        </div>

        <label className="mt-5 block text-sm text-ink-300" htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoComplete="given-name"
          className="mt-1.5 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm focus:border-signal focus:outline-none"
        />

        <fieldset className="mt-5" disabled={selected?.type === 'system-design'}>
          <legend className="text-sm text-ink-300">Language</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {Object.entries(LANGUAGES).map(([lang, label]) => (
              <label key={lang} className={`cursor-pointer rounded-md border px-2 py-2 text-center text-sm ${language === lang ? 'border-signal bg-signal-dim text-signal' : 'border-ink-700 text-ink-300 hover:border-ink-600'}`}>
                <input type="radio" name="language" value={lang} checked={language === lang} onChange={() => setLanguage(lang)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {selected?.type === 'system-design' && <p className="mt-2 text-xs text-ink-400">Design sessions use a notes scratchpad instead of code.</p>}
        </fieldset>

        <button
          type="submit"
          disabled={starting || !selected || !name.trim()}
          className="mt-6 w-full rounded-md bg-signal py-2.5 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {starting ? 'Starting…' : 'Start interview'}
        </button>
        {error && <p role="alert" className={`mt-3 text-sm ${offline ? 'text-alarm' : 'text-fail'}`}>{error}</p>}
        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          Use Chrome or Edge with headphones for voice. Your code runs in a locked-down container: 128 MB, half a CPU, 5 seconds, no network.
        </p>
      </form>
    </main>
  );
}
