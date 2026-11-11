import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProblems } from '../src/seed/problems.js';

const { problems, duplicates } = buildProblems();

test('catalogue has at least 1000 unique problems', () => {
  console.log(`  ${problems.length} problems, ${duplicates.length} duplicate titles merged`);
  if (duplicates.length) console.log(`  merged: ${duplicates.join('; ')}`);
  assert.ok(problems.length >= 1000, `only ${problems.length} problems`);
  assert.equal(new Set(problems.map((p) => p.slug)).size, problems.length);
});

test('every problem has a statement, a difficulty, a topic and at least one hint', () => {
  for (const p of problems) {
    assert.ok(p.title && p.description.length > 20, `${p.slug}: statement`);
    assert.ok(['easy', 'medium', 'hard'].includes(p.difficulty), `${p.slug}: difficulty`);
    assert.ok(p.topic, `${p.slug}: topic`);
    assert.ok(p.hints.length >= 1, `${p.slug}: hints`);
    assert.match(p.slug, /^[a-z0-9-]+$/, `${p.slug}: slug`);
  }
});

test("Striver's SDE sheet is present and sectioned", () => {
  const sheet = problems.filter((p) => p.sheets.includes('striver-sde'));
  console.log(`  ${sheet.length} problems on Striver's SDE sheet`);
  assert.ok(sheet.length >= 180);
  assert.ok(sheet.every((p) => p.sheetSection.startsWith('Day ')));
});

test('runnable problems have computed expectations and both starter codes', () => {
  const runnable = problems.filter((p) => p.testCases.length);
  console.log(`  ${runnable.length} problems with test suites`);
  assert.ok(runnable.length >= 40);
  for (const p of runnable) {
    assert.ok(p.functionName.python && p.functionName.javascript, `${p.slug}: function names`);
    assert.ok(p.starterCode.python.includes(p.functionName.python), `${p.slug}: python starter`);
    assert.ok(p.starterCode.javascript.includes(p.functionName.javascript), `${p.slug}: js starter`);
    assert.ok(p.starterCode.cpp.includes(p.functionName.cpp), `${p.slug}: c++ starter`);
    assert.equal(p.cppSignature.params.length, p.testCases[0].input.length, `${p.slug}: c++ signature arity`);
    assert.ok(p.testCases.some((t) => !t.hidden), `${p.slug}: needs a visible test`);
    for (const t of p.testCases) assert.notEqual(t.expected, undefined, `${p.slug}: expected value`);
  }
});

test('topic distribution', () => {
  const counts = {};
  for (const p of problems) counts[p.topic] = (counts[p.topic] || 0) + 1;
  console.log(' ', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  assert.ok(Object.keys(counts).length >= 15);
});
