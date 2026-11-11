// Compact problem catalogue. Each group is a block of pipe-delimited lines:
//
//   Title | E/M/H | statement | hint one ;; hint two | target time | target space (optional)
//
// Statements are original one-paragraph summaries of well-known interview problems. Hints are
// ordered from gentle to strong; candidates reveal them one at a time during an interview.
import { ARRAYS } from './arrays.js';
import { BINARY_SEARCH } from './binarySearch.js';
import { DESIGN } from './design.js';
import { DP } from './dp.js';
import { GRAPHS } from './graphs.js';
import { GREEDY_BACKTRACKING } from './greedyBacktracking.js';
import { HASHING_WINDOW } from './hashingWindow.js';
import { LINKED_LIST } from './linkedList.js';
import { MATH_BITS } from './mathBits.js';
import { STACK_QUEUE_HEAP } from './stackQueueHeap.js';
import { STRINGS } from './strings.js';
import { STRIVER_SDE } from './striver.js';
import { TREES } from './trees.js';

export const SHEETS = { 'striver-sde': "Striver's SDE Sheet" };

const DIFFICULTY = { E: 'easy', M: 'medium', H: 'hard' };

export const slugify = (title) => title
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/\+/g, ' plus ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const camel = (slug) => slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^(\d)/, 'n$1');

function starter(title, type) {
  if (type === 'system-design') {
    return { markdown: `# ${title}\n\n## Requirements\n- \n\n## Capacity estimates\n- \n\n## API\n- \n\n## Data model\n- \n\n## Architecture\n- \n\n## Trade-offs\n- \n` };
  }
  const note = 'No test suite for this problem. Write your solution, call it with your own inputs,\n';
  return {
    python: `# ${title}\n# ${note}# and press Run to see what it prints.\n\ndef solve():\n    pass\n\n\nprint(solve())\n`,
    javascript: `// ${title}\n// ${note}// and press Run to see what it prints.\n\nfunction solve() {\n}\n\nconsole.log(solve());\n`,
    cpp: `// ${title}\n// ${note}// and press Run to see what it prints.\n#include <bits/stdc++.h>\nusing namespace std;\n\nint solve() {\n    return 0;\n}\n\nint main() {\n    cout << solve() << "\\n";\n    return 0;\n}\n`,
  };
}

function parseGroup(group, startOrder) {
  const type = group.type || 'coding';
  return group.items.trim().split('\n').map((raw) => raw.trim()).filter(Boolean).map((line, i) => {
    const [title, level, statement, hints = '', time = '', space = ''] = line.split('|').map((part) => part.trim());
    if (!title || !DIFFICULTY[level] || !statement) throw new Error(`Malformed catalogue line: "${line.slice(0, 80)}"`);
    const slug = slugify(title);
    return {
      slug,
      title,
      type,
      difficulty: DIFFICULTY[level],
      topic: group.topic,
      tags: [group.topic.toLowerCase(), ...(group.tags || [])],
      sheets: group.sheet ? [group.sheet] : [],
      sheetSection: group.section || '',
      order: startOrder + i,
      description: type === 'coding'
        ? `${statement}\n\nThe statement is deliberately brief, as it would be in a real interview. Ask your interviewer about input format, constraints and edge cases before you start.`
        : statement,
      hints: hints.split(';;').map((h) => h.trim()).filter(Boolean),
      expectedTime: time || (type === 'coding' ? 'O(n)' : 'n/a'),
      expectedSpace: space,
      starterCode: starter(title, type),
      functionName: type === 'coding' ? { python: 'solve', javascript: 'solve', cpp: 'solve' } : undefined,
      testCases: [],
    };
  });
}

/** Flatten every group into unique problems. A title listed twice is merged, not duplicated. */
export function buildCatalogue() {
  const groups = [...STRIVER_SDE, ...ARRAYS, ...STRINGS, ...HASHING_WINDOW, ...STACK_QUEUE_HEAP, ...LINKED_LIST, ...BINARY_SEARCH, ...TREES, ...GRAPHS, ...DP, ...GREEDY_BACKTRACKING, ...MATH_BITS, ...DESIGN];
  const bySlug = new Map();
  const duplicates = [];
  let order = 0;
  for (const group of groups) {
    const parsed = parseGroup(group, order);
    order += parsed.length;
    for (const problem of parsed) {
      const existing = bySlug.get(problem.slug);
      if (!existing) bySlug.set(problem.slug, problem);
      else {
        duplicates.push(problem.title);
        existing.tags = [...new Set([...existing.tags, ...problem.tags])];
        existing.sheets = [...new Set([...existing.sheets, ...problem.sheets])];
        if (!existing.sheetSection) existing.sheetSection = problem.sheetSection;
      }
    }
  }
  return { problems: [...bySlug.values()], duplicates };
}

export { camel };
