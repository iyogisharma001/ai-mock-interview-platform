// Runs every auto-generated test suite against its own reference solution inside the real sandbox:
//   npm run test:suites
// This proves the suites survive serialisation and finish well inside the time and memory limits.
import { RUNNABLE, buildRunnable } from '../src/seed/catalog/runnable.js';
import { runInSandbox } from '../src/services/sandboxEngine.js';

let failed = 0;
for (const spec of RUNNABLE) {
  const problem = buildRunnable(spec);
  const result = await runInSandbox({
    // Some references use the catalogue's `range` helper, so ship it alongside them.
    code: `const range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));\nconst ${spec.fn} = ${spec.ref.toString()};`,
    language: 'javascript',
    functionName: spec.fn,
    tests: problem.testCases,
    compare: problem.compare,
  });
  const ok = result.status === 'accepted';
  if (!ok) failed += 1;
  console.log(`${ok ? '✔' : '✖'} ${spec.title.padEnd(44)} ${result.passed}/${result.total}  ${String(result.durationMs).padStart(5)} ms  ${ok ? '' : result.status}`);
  if (!ok) console.log(result.results.filter((r) => !r.passed).slice(0, 2), result.stderr);
}
console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${RUNNABLE.length} suites pass against their reference solutions`);
process.exit(failed ? 1 : 0);
