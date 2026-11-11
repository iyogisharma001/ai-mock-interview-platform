// Test harness executed inside the sandbox container. It never sees expected values:
// it reports what the candidate's function returned and the host does the comparison.
const fs = require('fs');

const SENTINEL = process.argv[2];
const spec = JSON.parse(fs.readFileSync('/workspace/tests.json', 'utf8'));
const write = (s) => fs.writeSync(1, s);
const emit = (payload) => write(`\n${SENTINEL}${JSON.stringify(payload)}\n`);

let fn;
try {
  fn = require('/workspace/solution.js');
  if (typeof fn !== 'function') throw new ReferenceError(`Function "${spec.functionName}" is not defined`);
} catch (err) {
  process.stderr.write(`${(err && err.stack) || err}\n`);
  emit({ type: 'load_error', message: String((err && err.message) || err) });
  process.exit(1);
}

const realLog = console.log;
const total = spec.tests.length;
spec.tests.forEach((args, index) => {
  let captured = '';
  console.log = (...parts) => {
    if (captured.length < 2000) captured += `${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  };
  const started = process.hrtime.bigint();
  const result = { type: 'test', index };
  try {
    const actual = fn(...structuredClone(args));
    result.ok = true;
    result.actual = actual === undefined ? null : actual;
    JSON.stringify(result.actual);
  } catch (err) {
    result.ok = false;
    delete result.actual;
    result.error = String((err && err.stack) || err).slice(0, 1500);
  }
  console.log = realLog;
  result.ms = Number(process.hrtime.bigint() - started) / 1e6;
  result.stdout = captured.slice(0, 2000);
  write(`> test ${index + 1}/${total} executed in ${result.ms.toFixed(2)} ms\n`);
  emit(result);
});

emit({ type: 'done' });
process.exit(0);
