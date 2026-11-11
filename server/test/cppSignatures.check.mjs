// Compiles the generated C++ harness for every problem with a test suite against a stub solution:
//   npm run test:cpp
// A stub returns a default value, so the expected outcome is "wrong answer", never "compile error".
// This proves every C++ signature is valid and every test input parses into its declared types.
import { buildProblems } from '../src/seed/problems.js';
import { runInSandbox } from '../src/services/sandboxEngine.js';

const problems = buildProblems().problems.filter((p) => p.testCases.length);
let failed = 0;
for (const p of problems) {
  const stub = p.starterCode.cpp.replace('{\n    \n}', '{\n    return {};\n}');
  const result = await runInSandbox({ code: stub, language: 'cpp', functionName: p.functionName.cpp, signature: p.cppSignature, tests: p.testCases, compare: p.compare });
  const ran = result.results.filter((r) => r.status === 'passed' || r.status === 'failed').length;
  const ok = result.status !== 'compile_error' && ran === result.total;
  if (!ok) failed += 1;
  console.log(`${ok ? '✔' : '✖'} ${p.title.padEnd(46)} compiled in ${String(result.compileMs).padStart(5)} ms, ${ran}/${result.total} inputs parsed and ran  ${ok ? '' : `${result.status} ${result.error || result.stderr}`}`);
}
console.log(failed ? `\n${failed} problem(s) failed` : `\nAll ${problems.length} C++ harnesses compile and parse their inputs`);
process.exit(failed ? 1 : 0);
