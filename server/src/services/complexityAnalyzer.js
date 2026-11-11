// Fast, dependency-free static heuristics. This is the cheap gate that decides whether the
// (slower, more accurate) LLM review is worth running, and the fallback when no LLM is configured.

const ORDER = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)', 'O(n^3)', 'O(2^n)'];

export function complexityRank(label) {
  const s = String(label || '').toLowerCase().replace(/[\s*·]/g, '').replace('²', '^2').replace('³', '^3');
  if (s.includes('2^n') || s.includes('n!')) return 6;
  if (s.includes('n^3')) return 5;
  if (s.includes('n^2')) return 4;
  if (s.includes('nlogn') || s.includes('nlog(n)')) return 3;
  if (s.includes('logn') || s.includes('log(n)')) return 1;
  if (s.includes('o(1)')) return 0;
  return 2;
}

const HIDDEN_LINEAR = {
  python: /\.(index|count|remove)\(|\.pop\(0\)|\.insert\(0\s*,/,
  javascript: /\.(includes|indexOf|lastIndexOf|shift|unshift|splice|find|findIndex|filter)\(/,
  // std::find / std::count over a range, and erase or insert at the front of a vector
  cpp: /\b(find|count|accumulate|max_element|min_element)\s*\([^)]*\.begin\(\)|\.erase\(|\.insert\(\s*\w+\.begin\(\)/,
};
const CONSTANT_BOUND = /range\(\s*\d+\s*\)|<\s*\d+\s*;|<=\s*\d+\s*;/;

function stripStrings(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
}

function scanPython(lines) {
  const loops = [];
  const stack = [];
  lines.forEach((raw, i) => {
    const line = stripStrings(raw);
    if (!line.trim() || line.trim().startsWith('#')) return;
    const indent = line.length - line.trimStart().length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop().end = i;
    const m = /^\s*(for|while)\b/.exec(line);
    if (m) {
      const loop = { kind: m[1], line: i + 1, indent, depth: stack.length + 1, parent: stack[stack.length - 1] || null, end: lines.length, text: line };
      loops.push(loop);
      stack.push(loop);
    }
  });
  return loops;
}

function scanJavascript(lines) {
  const loops = [];
  const stack = [];
  let depth = 0;
  let inBlockComment = false;
  lines.forEach((raw, i) => {
    let line = stripStrings(raw);
    if (inBlockComment) {
      if (!line.includes('*/')) return;
      line = line.slice(line.indexOf('*/') + 2);
      inBlockComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
    if (line.includes('/*')) {
      inBlockComment = true;
      line = line.slice(0, line.indexOf('/*'));
    }
    const m = /\b(for|while)\s*\(/.exec(line) || /\.(forEach|map|filter|some|every|reduce|flatMap)\(\s*(?:async\s*)?(?:function\b|\(?[\w\s,{}[\]=.]*\)?\s*=>)/.exec(line);
    if (m) {
      const loop = { kind: m[1] === 'while' ? 'while' : 'for', line: i + 1, braceDepth: depth, depth: stack.length + 1, parent: stack[stack.length - 1] || null, end: lines.length, text: line, opened: false };
      loops.push(loop);
      stack.push(loop);
    }
    for (const ch of line) {
      if (ch === '{') {
        depth += 1;
        const top = stack[stack.length - 1];
        if (top && !top.opened && depth === top.braceDepth + 1) top.opened = true;
      } else if (ch === '}') {
        depth -= 1;
        while (stack.length && stack[stack.length - 1].opened && depth <= stack[stack.length - 1].braceDepth) stack.pop().end = i + 1;
      }
    }
    // Brace-less single-statement loop bodies end with their statement.
    if (!m) while (stack.length && !stack[stack.length - 1].opened && /;\s*$/.test(line)) stack.pop().end = i + 1;
  });
  return loops;
}

/**
 * @returns {{ estimate: string, rank: number, maxDepth: number, findings: Array<{pattern:string,startLine:number,endLine:number,confidence:'high'|'low',detail:string}> }}
 */
export function analyzeComplexity(code, language) {
  const lines = String(code || '').split('\n');
  if (!HIDDEN_LINEAR[language]) return { estimate: 'n/a', rank: 0, maxDepth: 0, findings: [] };

  // C++ shares the brace-and-keyword loop syntax the JavaScript scanner understands.
  const loops = language === 'python' ? scanPython(lines) : scanJavascript(lines);
  const findings = [];
  let maxDepth = 0;
  let effective = 0;

  for (const loop of loops) {
    maxDepth = Math.max(maxDepth, loop.depth);
    if (loop.depth >= 2 && !CONSTANT_BOUND.test(loop.text)) {
      // `while` inside `for` is the shape of sliding-window / two-pointer code, which is usually linear.
      const amortisable = loop.kind === 'while' && loop.parent?.kind === 'for';
      const outer = loop.parent;
      findings.push({
        pattern: 'nested-loop',
        startLine: outer.line,
        endLine: Math.max(loop.end, loop.line),
        confidence: amortisable ? 'low' : 'high',
        detail: `Loop on line ${loop.line} is nested inside the loop on line ${outer.line} (depth ${loop.depth}).`,
      });
      if (!amortisable) effective = Math.max(effective, loop.depth);
    } else {
      effective = Math.max(effective, Math.min(loop.depth, 1));
    }
  }

  const hidden = HIDDEN_LINEAR[language];
  for (const loop of loops) {
    for (let i = loop.line; i < Math.min(loop.end, lines.length); i += 1) {
      const text = stripStrings(lines[i]);
      if (hidden.test(text)) {
        findings.push({
          pattern: 'linear-op-in-loop',
          startLine: loop.line,
          endLine: i + 1,
          confidence: 'low',
          detail: `Line ${i + 1} calls a linear-time collection operation inside the loop that starts on line ${loop.line}.`,
        });
        break;
      }
    }
  }

  const sorts = /\.sort\(|\bsorted\(|\bsort\s*\(|\bstable_sort\s*\(/.test(code);
  let rank = effective >= 3 ? 5 : effective === 2 ? 4 : effective === 1 ? 2 : 0;
  if (sorts && rank < 3) rank = 3;

  // De-duplicate overlapping findings, strongest first.
  findings.sort((a, b) => (a.confidence === b.confidence ? a.startLine - b.startLine : a.confidence === 'high' ? -1 : 1));
  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.startLine) ? false : seen.add(f.startLine)));

  return { estimate: ORDER[rank], rank, maxDepth, findings: unique };
}
