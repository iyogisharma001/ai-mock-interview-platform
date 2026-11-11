import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeComplexity, complexityRank } from '../src/services/complexityAnalyzer.js';

test('ranks complexity labels', () => {
  assert.ok(complexityRank('O(n^2)') > complexityRank('O(n log n)'));
  assert.ok(complexityRank('O(n log n)') > complexityRank('O(n)'));
  assert.ok(complexityRank('O(N²)') === complexityRank('O(n^2)'));
  assert.equal(complexityRank('O(1)'), 0);
});

test('python: nested for loops are quadratic with line numbers', () => {
  const code = [
    'def two_sum(nums, target):',
    '    for i in range(len(nums)):',
    '        for j in range(i + 1, len(nums)):',
    '            if nums[i] + nums[j] == target:',
    '                return [i, j]',
    '    return []',
  ].join('\n');
  const result = analyzeComplexity(code, 'python');
  assert.equal(result.estimate, 'O(n^2)');
  assert.equal(result.findings[0].confidence, 'high');
  assert.equal(result.findings[0].startLine, 2);
  assert.equal(result.findings[0].endLine, 5);
});

test('python: hash map single pass is linear and clean', () => {
  const code = 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n';
  const result = analyzeComplexity(code, 'python');
  assert.equal(result.estimate, 'O(n)');
  assert.equal(result.findings.length, 0);
});

test('python: sliding window (while inside for) is only a low-confidence finding', () => {
  const code = 'def f(s):\n    left = 0\n    seen = set()\n    for right in range(len(s)):\n        while s[right] in seen:\n            seen.discard(s[left])\n            left += 1\n        seen.add(s[right])\n';
  const result = analyzeComplexity(code, 'python');
  assert.equal(result.estimate, 'O(n)');
  assert.ok(result.findings.every((f) => f.confidence === 'low'));
});

test('javascript: nested loops, sequential loops and callbacks', () => {
  const nested = 'function twoSum(nums, target) {\n  for (let i = 0; i < nums.length; i++) {\n    for (let j = i + 1; j < nums.length; j++) {\n      if (nums[i] + nums[j] === target) return [i, j];\n    }\n  }\n}\n';
  assert.equal(analyzeComplexity(nested, 'javascript').estimate, 'O(n^2)');

  const sequential = 'function f(a) {\n  for (const x of a) {\n    g(x);\n  }\n  for (const y of a) {\n    g(y);\n  }\n}\n';
  const seq = analyzeComplexity(sequential, 'javascript');
  assert.equal(seq.estimate, 'O(n)');
  assert.equal(seq.findings.length, 0);

  const callback = 'function f(a) {\n  a.forEach((x) => {\n    for (const y of a) {\n      g(x, y);\n    }\n  });\n}\n';
  assert.equal(analyzeComplexity(callback, 'javascript').estimate, 'O(n^2)');
});

test('javascript: linear collection call inside a loop is flagged', () => {
  const code = 'function f(a) {\n  const out = [];\n  for (const x of a) {\n    if (!out.includes(x)) out.push(x);\n  }\n  return out;\n}\n';
  const result = analyzeComplexity(code, 'javascript');
  assert.equal(result.findings[0].pattern, 'linear-op-in-loop');
});

test('sorting raises the estimate to n log n', () => {
  assert.equal(analyzeComplexity('def f(a):\n    return sorted(a)\n', 'python').estimate, 'O(n log n)');
});
