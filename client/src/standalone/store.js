// Interviews held in the visitor's browser (localStorage) while the backend is offline.
// IDs start with "local-" so every page knows where to look.
const PREFIX = 'whiteboard:interview:';
const REPORT_PREFIX = 'whiteboard:report:';
const MAX_KEPT = 30;

export const isLocalId = (id) => typeof id === 'string' && id.startsWith('local-');

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full: drop the oldest interviews and try once more.
    prune(5);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or blocked storage: the session still works, it just will not survive a reload */
    }
  }
}

function prune(keep = MAX_KEPT) {
  try {
    const ids = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
      .map((k) => ({ k, at: read(k)?.startedAt || '' }))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    for (const { k } of ids.slice(keep)) {
      localStorage.removeItem(k);
      localStorage.removeItem(REPORT_PREFIX + k.slice(PREFIX.length));
    }
  } catch {
    /* ignore */
  }
}

const memory = new Map(); // fallback when localStorage is unavailable

export function createLocalInterview({ candidateName, problem, language }) {
  const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const lang = problem.type === 'system-design' ? 'markdown' : language;
  const record = {
    id,
    candidateName,
    problemSlug: problem.slug,
    language: lang,
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    code: problem.starterCode?.[lang] || '',
    transcript: [],
    history: [],
    runs: [],
    hintsUsed: 0,
    interruptions: 0,
    reportStatus: 'none',
  };
  prune();
  saveInterview(record);
  return record;
}

export function loadInterview(id) {
  return read(PREFIX + id) || memory.get(id) || null;
}

export function saveInterview(record) {
  memory.set(record.id, record);
  write(PREFIX + record.id, record);
}

export function loadReport(id) {
  return read(REPORT_PREFIX + id) || memory.get(`report:${id}`) || null;
}

export function saveReport(id, report) {
  memory.set(`report:${id}`, report);
  write(REPORT_PREFIX + id, report);
}
