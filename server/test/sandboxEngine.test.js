// Integration tests against a real Docker daemon. Skipped automatically when Docker is unreachable.
// Use SANDBOX_IMAGE_PYTHON / SANDBOX_IMAGE_JAVASCRIPT to point at images you already have locally.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { env } from '../src/config/env.js';
import { ensureImage, pingDocker, runInSandbox } from '../src/services/sandboxEngine.js';

const available = { docker: false, python: false, javascript: false, cpp: false };

try {
  await pingDocker();
  available.docker = true;
} catch {
  /* Docker unreachable: everything below skips */
}
if (available.docker) {
  for (const [lang, image] of [['python', env.SANDBOX_IMAGE_PYTHON], ['javascript', env.SANDBOX_IMAGE_JAVASCRIPT], ['cpp', env.SANDBOX_IMAGE_CPP]]) {
    try {
      await ensureImage(image);
      available[lang] = true;
    } catch {
      /* image missing and auto-pull disabled */
    }
  }
}

const tests = [
  { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { input: [[3, 2, 4], 6], expected: [2, 1] },
  { input: [[3, 3], 6], expected: [0, 1], hidden: true },
];

describe('sandbox: python', { timeout: 60_000 }, () => {
  const run = (code, extra = {}) => runInSandbox({ code, language: 'python', functionName: 'two_sum', tests, compare: 'sorted', ...extra });

  test('accepts a correct solution and streams output', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const lines = [];
    const result = await run('def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n', { onOutput: (s, l) => lines.push([s, l]) });
    assert.equal(result.status, 'accepted');
    assert.equal(result.passed, 3);
    assert.ok(lines.some(([, l]) => l.includes('test 1/3')));
    assert.equal(result.results[2].input, undefined, 'hidden test input must not leak');
  });

  test('reports wrong answers with actual vs expected', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const result = await run('def two_sum(nums, target):\n    print("debug")\n    return [0, 0]\n');
    assert.equal(result.status, 'wrong_answer');
    assert.equal(result.results[0].actual, '[0,0]');
    assert.equal(result.results[0].stdout, 'debug\n');
  });

  test('kills infinite loops at the hard timeout', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const result = await run('def two_sum(nums, target):\n    while True:\n        pass\n');
    assert.equal(result.status, 'timeout');
    assert.ok(result.timedOut);
    assert.ok(result.durationMs < env.SANDBOX_TIMEOUT_MS + 4000);
  });

  test('surfaces syntax errors as compile errors', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const result = await run('def two_sum(nums, target)\n    return []\n');
    assert.equal(result.status, 'compile_error');
    assert.match(result.error, /SyntaxError/);
  });

  test('has no network and a read-only filesystem', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const code = [
      'import socket',
      'def two_sum(nums, target):',
      '    out = []',
      '    try:',
      '        socket.create_connection(("1.1.1.1", 53), timeout=1)',
      '        out.append(1)',
      '    except OSError:',
      '        out.append(0)',
      '    try:',
      '        open("/workspace/pwned", "w").write("x")',
      '        out.append(1)',
      '    except OSError:',
      '        out.append(0)',
      '    return out',
    ].join('\n');
    const result = await runInSandbox({ code, language: 'python', functionName: 'two_sum', tests: [{ input: [[], 0], expected: [0, 0] }] });
    assert.equal(result.status, 'accepted', JSON.stringify(result.results));
  });

  test('enforces the memory cap', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const result = await run('def two_sum(nums, target):\n    blob = bytearray(400 * 1024 * 1024)\n    for i in range(0, len(blob), 4096):\n        blob[i] = 1\n    return [0, 1]\n');
    assert.notEqual(result.status, 'accepted');
  });
});

describe('sandbox: scratch runs (no test suite)', { timeout: 60_000 }, () => {
  test('python script output is streamed and captured', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const lines = [];
    const result = await runInSandbox({ code: 'def solve():\n    return sum(range(10))\n\nprint(solve())\n', language: 'python', onOutput: (s, l) => lines.push(l) });
    assert.equal(result.mode, 'scratch');
    assert.equal(result.status, 'completed');
    assert.equal(result.stdoutTail, '45');
    assert.ok(lines.includes('45'));
  });

  test('javascript script errors are reported', async (t) => {
    if (!available.javascript) return t.skip('javascript sandbox image unavailable');
    const result = await runInSandbox({ code: 'console.log("before");\nthrow new Error("boom");\n', language: 'javascript' });
    assert.equal(result.status, 'runtime_error');
    assert.equal(result.stdoutTail, 'before');
    assert.match(result.stderr, /boom/);
  });

  test('scratch runs obey the hard timeout', async (t) => {
    if (!available.python) return t.skip('python sandbox image unavailable');
    const result = await runInSandbox({ code: 'while True:\n    pass\n', language: 'python' });
    assert.equal(result.status, 'timeout');
  });
});

describe('sandbox: c++', { timeout: 180_000 }, () => {
  const signature = { ret: 'vector<int>', params: ['vector<int>&', 'int'] };
  const run = (code, extra = {}) => runInSandbox({ code, language: 'cpp', functionName: 'twoSum', signature, tests, compare: 'sorted', ...extra });
  const header = '#include <bits/stdc++.h>\nusing namespace std;\n';

  test('compiles and accepts a correct solution', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const lines = [];
    const result = await run(`${header}vector<int> twoSum(vector<int>& nums, int target) {\n  unordered_map<int, int> seen;\n  for (int i = 0; i < (int)nums.size(); i++) {\n    auto it = seen.find(target - nums[i]);\n    if (it != seen.end()) return {it->second, i};\n    seen[nums[i]] = i;\n  }\n  return {};\n}\n`, { onOutput: (s, l) => lines.push(l) });
    assert.equal(result.status, 'accepted', result.stderr);
    assert.equal(result.passed, 3);
    assert.ok(result.compileMs > 0);
    assert.ok(lines.some((l) => l.startsWith('compiled in')));
  });

  test('a main() left in the solution does not break the harness', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const result = await run(`${header}vector<int> twoSum(vector<int>& nums, int target) { return {0, 0}; }\nint main() { return 0; }\n`);
    assert.equal(result.status, 'wrong_answer');
    assert.equal(result.results[0].actual, '[0,0]');
  });

  test('reports compiler errors without running anything', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const result = await run(`${header}vector<int> twoSum(vector<int>& nums, int target) { return undefined_name; }\n`);
    assert.equal(result.status, 'compile_error');
    assert.match(result.error, /undefined_name/);
    assert.ok(!result.stderr.includes('/workspace/'), 'container paths should be stripped');
  });

  test('exceptions and infinite loops are contained', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const thrown = await run(`${header}vector<int> twoSum(vector<int>& nums, int target) { return {nums.at(99)}; }\n`);
    assert.equal(thrown.status, 'runtime_error');
    assert.match(thrown.results[0].error, /range/);
    const looping = await run(`${header}vector<int> twoSum(vector<int>& nums, int target) { volatile int x = 0; while (true) x = x + 1; return {}; }\n`);
    assert.equal(looping.status, 'timeout');
  });

  test('scratch run compiles and runs main()', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const result = await runInSandbox({ code: `${header}int main() {\n  vector<int> v{3, 1, 2};\n  sort(v.begin(), v.end());\n  for (int x : v) cout << x << ' ';\n  cout << "\\n";\n}\n`, language: 'cpp' });
    assert.equal(result.status, 'completed', result.stderr);
    assert.equal(result.stdoutTail.trim(), '1 2 3');
  });

  test('every value shape the suites use round-trips through the harness', async (t) => {
    if (!available.cpp) return t.skip('c++ sandbox image unavailable');
    const grid = await runInSandbox({
      code: `${header}int countOnes(vector<vector<char>>& g) { int c = 0; for (auto& r : g) for (char x : r) c += x == '1'; return c; }\n`,
      language: 'cpp', functionName: 'countOnes', signature: { ret: 'int', params: ['vector<vector<char>>&'] },
      tests: [{ input: [[['1', '0'], ['1', '1']]], expected: 3 }],
    });
    assert.equal(grid.status, 'accepted', JSON.stringify(grid.results));
    const words = await runInSandbox({
      code: `${header}bool has(string s, vector<string>& words) { return find(words.begin(), words.end(), s) != words.end(); }\n`,
      language: 'cpp', functionName: 'has', signature: { ret: 'bool', params: ['string', 'vector<string>&'] },
      tests: [{ input: ['a "quoted" word', ['x', 'a "quoted" word']], expected: true }, { input: ['', []], expected: false }],
    });
    assert.equal(words.status, 'accepted', JSON.stringify(words.results));
    const nested = await runInSandbox({
      code: `${header}vector<vector<int>> echo(vector<vector<int>>& m) { return m; }\n`,
      language: 'cpp', functionName: 'echo', signature: { ret: 'vector<vector<int>>', params: ['vector<vector<int>>&'] },
      tests: [{ input: [[[1, -2], [], [3]]], expected: [[1, -2], [], [3]] }],
    });
    assert.equal(nested.status, 'accepted', JSON.stringify(nested.results));
  });
});

describe('sandbox: javascript', { timeout: 60_000 }, () => {
  test('accepts a correct solution', async (t) => {
    if (!available.javascript) return t.skip('javascript sandbox image unavailable');
    const result = await runInSandbox({
      code: 'function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];\n    seen.set(nums[i], i);\n  }\n}\n',
      language: 'javascript',
      functionName: 'twoSum',
      tests,
      compare: 'sorted',
    });
    assert.equal(result.status, 'accepted');
  });

  test('reports runtime errors', async (t) => {
    if (!available.javascript) return t.skip('javascript sandbox image unavailable');
    const result = await runInSandbox({ code: 'function twoSum() { throw new Error("boom"); }', language: 'javascript', functionName: 'twoSum', tests });
    assert.equal(result.status, 'runtime_error');
    assert.match(result.results[0].error, /boom/);
  });
});
