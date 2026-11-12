// The full problem catalogue, shipped with the site (public/catalogue.json), so problems are always
// available even when the backend is offline. Fetched once, on first use.
let cache = null;

export function loadCatalogue() {
  cache ??= fetch('/catalogue.json', { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`catalogue ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      cache = null; // allow a retry on the next call
      throw err;
    });
  return cache;
}

export async function getProblem(slug) {
  const { problems } = await loadCatalogue();
  return problems.find((p) => p.slug === slug) || null;
}

/** Same shape the server's toPublicProblem returns. */
export function toPublicProblem(p) {
  return {
    id: p.slug,
    slug: p.slug,
    title: p.title,
    type: p.type,
    difficulty: p.difficulty,
    tags: p.tags,
    topic: p.topic,
    sheets: p.sheets,
    sheetSection: p.sheetSection,
    hintCount: p.hints.length,
    hasTests: p.testCases.length > 0,
    description: p.description,
    functionName: p.functionName,
    starterCode: p.starterCode,
    languages: p.type === 'coding' ? ['python', 'javascript', 'cpp'] : ['markdown'],
    sampleTests: p.testCases.filter((t) => !t.hidden).map((t) => ({ input: t.input, expected: t.expected })),
    totalTests: p.testCases.length,
  };
}

/** Mirrors GET /api/problems on the server: filters, ordering and paging. */
export async function listProblems({ q, difficulty, topic, sheet, tests, page = 1, limit = 40 } = {}) {
  const { problems } = await loadCatalogue();
  const needle = (q || '').trim().toLowerCase();
  const matching = problems.filter((p) => (!needle || p.title.toLowerCase().includes(needle))
    && (!difficulty || p.difficulty === difficulty)
    && (!topic || p.topic === topic)
    && (!sheet || p.sheets.includes(sheet))
    && (!tests || p.testCases.length > 0));
  const size = Math.max(1, Math.min(Number(limit) || 40, 100));
  const current = Math.max(1, Number(page) || 1);
  return {
    total: matching.length,
    page: current,
    pages: Math.max(1, Math.ceil(matching.length / size)),
    items: matching.slice((current - 1) * size, current * size).map((p) => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      difficulty: p.difficulty,
      topic: p.topic,
      sheetSection: sheet ? p.sheetSection : '',
      hasTests: p.testCases.length > 0,
    })),
  };
}

/** Mirrors GET /api/problems/meta. */
export async function catalogueMeta() {
  const { problems, sheets } = await loadCatalogue();
  const topics = new Map();
  const sheetCounts = new Map();
  for (const p of problems) {
    if (p.topic) topics.set(p.topic, (topics.get(p.topic) || 0) + 1);
    for (const s of p.sheets) sheetCounts.set(s, (sheetCounts.get(s) || 0) + 1);
  }
  return {
    total: problems.length,
    withTests: problems.filter((p) => p.testCases.length).length,
    topics: [...topics].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    sheets: [...sheetCounts].map(([id, count]) => ({ id, name: sheets[id] || id, count })),
  };
}
