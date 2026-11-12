// Writes the full problem catalogue to client/public/catalogue.json so the hosted site can work on
// its own when the backend is unreachable. Run after changing anything in src/seed:
//   npm --prefix server run catalogue:export
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS } from '../src/seed/catalog/index.js';
import { buildProblems } from '../src/seed/problems.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '..', '..', 'client', 'public', 'catalogue.json');

const { problems } = buildProblems();
const items = problems
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
  .map((p) => ({
    slug: p.slug,
    title: p.title,
    type: p.type || 'coding',
    difficulty: p.difficulty,
    topic: p.topic,
    tags: p.tags || [],
    sheets: p.sheets || [],
    sheetSection: p.sheetSection || '',
    description: p.description,
    functionName: p.functionName || null,
    starterCode: p.starterCode || {},
    compare: p.compare || 'exact',
    expectedTime: p.expectedTime || '',
    expectedSpace: p.expectedSpace || '',
    hints: p.hints || [],
    rubric: p.rubric || '',
    testCases: (p.testCases || []).map((t) => ({ input: t.input, expected: t.expected, hidden: Boolean(t.hidden) })),
  }));

writeFileSync(target, JSON.stringify({ version: 1, sheets: SHEETS, problems: items }));
const kb = Math.round(JSON.stringify({ sheets: SHEETS, problems: items }).length / 1024);
console.log(`Wrote ${items.length} problems (${kb} KB) to ${path.relative(process.cwd(), target)}`);
