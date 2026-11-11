// End-to-end smoke test against a running server: `API_URL=http://localhost:4000 npm run test:e2e`
// Walks one full interview: join -> greeting -> interruption -> sandbox runs -> chat -> end -> report.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const API = process.env.API_URL || 'http://localhost:4000';
const LANGUAGE = process.env.E2E_LANGUAGE || 'python';

const CPP = '#include <bits/stdc++.h>\nusing namespace std;\n';
const SOLUTIONS = {
  cpp: {
    slow: `${CPP}vector<int> twoSum(vector<int>& nums, int target) {\n  for (int i = 0; i < (int)nums.size(); i++) {\n    for (int j = i + 1; j < (int)nums.size(); j++) {\n      if (nums[i] + nums[j] == target) return {i, j};\n    }\n  }\n  return {};\n}\n`,
    fast: `${CPP}vector<int> twoSum(vector<int>& nums, int target) {\n  unordered_map<int, int> seen;\n  for (int i = 0; i < (int)nums.size(); i++) {\n    auto it = seen.find(target - nums[i]);\n    if (it != seen.end()) return {it->second, i};\n    seen[nums[i]] = i;\n  }\n  return {};\n}\n`,
  },
  python: {
    slow: 'def two_sum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []\n',
    fast: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []\n',
  },
  javascript: {
    slow: 'function twoSum(nums, target) {\n  for (let i = 0; i < nums.length; i++) {\n    for (let j = i + 1; j < nums.length; j++) {\n      if (nums[i] + nums[j] === target) return [i, j];\n    }\n  }\n  return [];\n}\n',
    fast: 'function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n',
  },
};

const http = async (path, options) => {
  const res = await fetch(`${API}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  return { status: res.status, body: await res.json() };
};
const step = (name) => console.log(`\n▸ ${name}`);

const health = await http('/health');
console.log('health', health.body);
assert.equal(health.status, 200);

const created = await http('/interviews', { method: 'POST', body: JSON.stringify({ candidateName: 'Smoke Test', problemSlug: 'two-sum', language: LANGUAGE }) });
assert.equal(created.status, 201, JSON.stringify(created.body));
const interviewId = created.body.id;

const socket = io(API, { transports: ['websocket'] });
const once = (event, timeoutMs = 20_000, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
  const handler = (payload) => {
    if (!predicate(payload)) return;
    clearTimeout(timer);
    socket.off(event, handler);
    resolve(payload);
  };
  socket.on(event, handler);
});
const call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const terminal = [];
socket.on('terminal:line', (line) => terminal.push(line));

try {
  step('join + greeting');
  const greeting = once('ai:stream:end');
  let greetedBeforeAck = false;
  socket.once('ai:stream:start', () => { greetedBeforeAck = !joinAcked; });
  let joinAcked = false;
  const joined = await call('interview:join', { interviewId });
  joinAcked = true;
  assert.ok(joined.ok, joined.error);
  assert.equal(joined.problem.sampleTests.length, 3, 'hidden tests must not be sent to the client');
  console.log('ai mode:', joined.aiMode);
  console.log('interviewer:', (await greeting).text);
  assert.equal(greetedBeforeAck, false, 'the greeting must not start before the join acknowledgement');

  step('typing a quadratic solution triggers an interruption');
  const interruption = once('ai:interrupt');
  socket.emit('code:change', { code: SOLUTIONS[LANGUAGE].slow, cursorLine: 3 });
  const cut = await interruption;
  console.log(`interrupt [lines ${cut.startLine}-${cut.endLine}, ${cut.timeComplexity}]:`, cut.message);
  assert.ok(cut.startLine >= 1 && cut.endLine >= cut.startLine);

  step('running the slow solution in the sandbox');
  let result = once('run:result', 30_000);
  let feedback = once('ai:stream:end', 40_000, (m) => m.kind === 'run-feedback');
  assert.ok((await call('code:run', {})).ok);
  const slow = await result;
  console.log(`status=${slow.status} passed=${slow.passed}/${slow.total} in ${slow.durationMs}ms`);
  assert.ok(slow.passed >= 3, 'sample tests should pass');
  assert.ok(terminal.length > 0, 'terminal output should stream');
  assert.equal(slow.results.find((r) => r.hidden).input, undefined, 'hidden inputs must not leak');
  console.log('interviewer:', (await feedback).text);

  step('running the optimal solution');
  result = once('run:result', 30_000);
  feedback = once('ai:stream:end', 40_000, (m) => m.kind === 'run-feedback');
  assert.ok((await call('code:run', { code: SOLUTIONS[LANGUAGE].fast, cursorLine: 1 })).ok);
  const fast = await result;
  console.log(`status=${fast.status} passed=${fast.passed}/${fast.total} in ${fast.durationMs}ms`);
  assert.equal(fast.status, 'accepted');
  await feedback;

  step('hints are revealed in order and counted');
  const hint = await call('hint:request', {});
  assert.ok(hint.ok, hint.error);
  assert.equal(hint.index, 0);
  assert.ok(hint.text.length > 5);
  console.log(`hint 1/${hint.total}:`, hint.text);

  step('conversation');
  const reply = once('ai:stream:end', 40_000, (m) => m.kind === 'reply');
  socket.emit('candidate:message', { text: 'I used a hash map so the time complexity is linear.', viaVoice: true });
  console.log('interviewer:', (await reply).text);

  step('end interview + report');
  const ready = once('report:ready', 120_000);
  const ended = await call('interview:end', {});
  assert.ok(ended.ok, ended.error);
  await ready;
  const report = await http(`/interviews/${interviewId}/report`);
  assert.equal(report.body.status, 'ready');
  const r = report.body.report;
  console.log(`verdict=${r.verdict} overall=${r.overall} by=${r.generatedBy}`);
  console.log('scores', r.scores, 'metrics', r.metrics);
  assert.equal(r.metrics.bestPassed, 5);
  assert.ok(r.metrics.interruptions >= 1);
  assert.equal(r.metrics.hintsUsed, 1);

  const saved = await http(`/interviews/${interviewId}`);
  assert.equal(saved.body.status, 'completed');
  assert.ok(saved.body.transcript.length >= 5);
  assert.equal(saved.body.runs.length, 2);

  step('catalogue browsing');
  const meta = await http('/problems/meta');
  console.log(`catalogue: ${meta.body.total} problems, ${meta.body.withTests} with tests, sheets:`, meta.body.sheets);
  assert.ok(meta.body.total >= 1000);
  const sheet = await http('/problems?sheet=striver-sde&limit=100');
  assert.ok(sheet.body.total >= 180);
  assert.equal(sheet.body.items[0].sheetSection, 'Day 1: Arrays');
  const found = await http('/problems?q=rain%20water&difficulty=hard');
  assert.ok(found.body.items.some((p) => p.slug === 'trapping-rain-water'));

  step('a catalogue problem with an auto-verified test suite');
  const graded = await http('/interviews', { method: 'POST', body: JSON.stringify({ candidateName: 'Smoke Test', problemSlug: 'coin-change', language: LANGUAGE }) });
  const joinedGraded = await call('interview:join', { interviewId: graded.body.id });
  assert.ok(joinedGraded.problem.hasTests);
  const coin = LANGUAGE === 'cpp'
    ? `${CPP}int coinChange(vector<int>& coins, int amount) {\n  vector<int> dp(amount + 1, INT_MAX);\n  dp[0] = 0;\n  for (int a = 1; a <= amount; a++) for (int c : coins) if (c <= a && dp[a - c] != INT_MAX) dp[a] = min(dp[a], dp[a - c] + 1);\n  return dp[amount] == INT_MAX ? -1 : dp[amount];\n}\n`
    : LANGUAGE === 'python'
    ?'def coin_change(coins, amount):\n    dp = [0] + [float("inf")] * amount\n    for a in range(1, amount + 1):\n        for c in coins:\n            if c <= a:\n                dp[a] = min(dp[a], dp[a - c] + 1)\n    return dp[amount] if dp[amount] != float("inf") else -1\n'
    : 'function coinChange(coins, amount) {\n  const dp = Array(amount + 1).fill(Infinity);\n  dp[0] = 0;\n  for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);\n  return dp[amount] === Infinity ? -1 : dp[amount];\n}\n';
  result = once('run:result', 30_000);
  assert.ok((await call('code:run', { code: coin, cursorLine: 1 })).ok);
  const coinRun = await result;
  console.log(`coin-change: status=${coinRun.status} passed=${coinRun.passed}/${coinRun.total}`);
  assert.equal(coinRun.status, 'accepted');

  step('a catalogue problem without tests runs as a script');
  const scratch = await http('/interviews', { method: 'POST', body: JSON.stringify({ candidateName: 'Smoke Test', problemSlug: 'set-matrix-zeroes', language: LANGUAGE }) });
  const joinedScratch = await call('interview:join', { interviewId: scratch.body.id });
  assert.equal(joinedScratch.problem.hasTests, false);
  assert.equal(joinedScratch.problem.sheetSection, 'Day 1: Arrays');
  result = once('run:result', 30_000);
  const script = LANGUAGE === 'cpp' ? `${CPP}int main() { cout << "zeroed [[1,0],[0,0]]" << endl; }\n` : LANGUAGE === 'python' ?'print("zeroed", [[1, 0], [0, 0]])\n' : 'console.log("zeroed", JSON.stringify([[1, 0], [0, 0]]));\n';
  assert.ok((await call('code:run', { code: script, cursorLine: 1 })).ok);
  const scratchRun = await result;
  console.log(`scratch run: status=${scratchRun.status} exit=${scratchRun.exitCode} output=${JSON.stringify(scratchRun.stdoutTail)}`);
  assert.equal(scratchRun.mode, 'scratch');
  assert.equal(scratchRun.status, 'completed');
  assert.match(scratchRun.stdoutTail, /zeroed/);

  console.log('\n✔ end-to-end smoke test passed');
} finally {
  socket.disconnect();
}
