// Runs candidate code inside the visitor's own browser, in a Web Worker that is terminated on a hard
// time limit. Used when the backend (and its Docker sandbox) is unreachable. The code never leaves
// the browser. Returns the same result shape as the server sandbox, so the UI is unchanged.
const RUN_TIMEOUT_MS = 5000;
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
const PYODIDE_LOAD_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------------------------
// Worker sources
// ---------------------------------------------------------------------------------------------

const JS_WORKER = `
self.onmessage = (event) => {
  const { code, functionName, tests } = event.data;
  const out = [];
  const fmt = (v) => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());
  let buffer = null;
  const write = (stream, parts) => {
    const line = parts.map(fmt).join(' ');
    if (buffer !== null) { if (buffer.length < 2000) buffer += line + '\\n'; return; }
    self.postMessage({ type: 'line', stream, text: line });
  };
  console.log = (...p) => write('stdout', p);
  console.info = console.log;
  console.warn = (...p) => write('stderr', p);
  console.error = console.warn;
  try {
    if (!tests.length) {
      new Function(code)();
      self.postMessage({ type: 'done' });
      return;
    }
    const fn = new Function(code + '\\n;return typeof ' + functionName + " === 'function' ? " + functionName + ' : undefined;')();
    if (typeof fn !== 'function') throw new ReferenceError('Function "' + functionName + '" is not defined');
    tests.forEach((args, index) => {
      buffer = '';
      const started = performance.now();
      const result = { index };
      try {
        const actual = fn(...structuredClone(args));
        result.ok = true;
        result.actual = actual === undefined ? null : JSON.parse(JSON.stringify(actual));
      } catch (err) {
        result.ok = false;
        result.error = String((err && err.stack) || err).slice(0, 1500);
      }
      result.ms = performance.now() - started;
      result.stdout = buffer;
      buffer = null;
      self.postMessage({ type: 'line', stream: 'stdout', text: '> test ' + (index + 1) + '/' + tests.length + ' executed in ' + result.ms.toFixed(2) + ' ms' });
      self.postMessage({ type: 'test', result });
    });
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'load_error', message: String((err && err.message) || err) });
  }
};`;

const PY_WORKER = `
importScripts('${PYODIDE_URL}pyodide.js');
let ready = null;
const send = (stream) => (text) => self.postMessage({ type: 'line', stream, text });
self.onmessage = async (event) => {
  const { code, functionName, tests } = event.data;
  try {
    ready ??= loadPyodide({ indexURL: '${PYODIDE_URL}' });
    const py = await ready;
    self.postMessage({ type: 'ready' });
    py.setStdout({ batched: send('stdout') });
    py.setStderr({ batched: send('stderr') });
    if (!tests.length) {
      await py.runPythonAsync(code);
      self.postMessage({ type: 'done' });
      return;
    }
    py.globals.set('__code', code);
    py.globals.set('__fn', functionName);
    py.globals.set('__tests', JSON.stringify(tests));
    const setup = \`
import json, io, contextlib, copy, time, traceback
__ns = {}
exec(__code, __ns)
__f = __ns.get(__fn)
if not callable(__f):
    raise NameError('Function "%s" is not defined' % __fn)
__cases = json.loads(__tests)
def __run_one(__i):
    __buf = io.StringIO()
    __t = time.perf_counter()
    __r = {"index": __i}
    try:
        with contextlib.redirect_stdout(__buf):
            __a = __f(*copy.deepcopy(__cases[__i]))
        __r.update(ok=True, actual=json.loads(json.dumps(__a, default=list)))
    except BaseException:
        __r.update(ok=False, error=traceback.format_exc(limit=6)[-1500:])
    __r["ms"] = (time.perf_counter() - __t) * 1000
    __r["stdout"] = __buf.getvalue()[:2000]
    return json.dumps(__r)
\`;
    try {
      await py.runPythonAsync(setup);
    } catch (err) {
      self.postMessage({ type: 'load_error', message: String(err.message || err).split('\\n').filter(Boolean).pop() });
      return;
    }
    // One test at a time, reported as it finishes, so a slow test does not hide the ones before it.
    for (let index = 0; index < tests.length; index += 1) {
      const result = JSON.parse(py.runPython('__run_one(' + index + ')'));
      self.postMessage({ type: 'line', stream: 'stdout', text: '> test ' + (index + 1) + '/' + tests.length + ' executed in ' + result.ms.toFixed(2) + ' ms' });
      self.postMessage({ type: 'test', result });
    }
    self.postMessage({ type: 'done' });
  } catch (err) {
    const message = String((err && err.message) || err);
    self.postMessage({ type: 'line', stream: 'stderr', text: message.trim().split('\\n').slice(-6).join('\\n') });
    self.postMessage({ type: 'runtime_error', message: message.trim().split('\\n').filter(Boolean).pop() });
  }
};`;

// ---------------------------------------------------------------------------------------------
// Grading (same rules as the server)
// ---------------------------------------------------------------------------------------------

const sortKey = (v) => JSON.stringify(v);
function normalise(value, compare) {
  const plain = value === undefined ? null : JSON.parse(JSON.stringify(value));
  if (compare === 'sorted' && Array.isArray(plain)) return [...plain].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  return plain;
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
const matches = (actual, expected, compare) => deepEqual(normalise(actual, compare), normalise(expected, compare));
const preview = (value) => {
  const text = JSON.stringify(value);
  return text === undefined ? 'undefined' : text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

let pyWorker = null; // kept alive between runs so Pyodide is only downloaded once
let pyReady = false;

function makeWorker(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

export const browserLanguages = ['python', 'javascript'];

/**
 * @param {{code:string, language:string, problem:object, onOutput:(stream:string, text:string)=>void}} args
 */
export function runInBrowser({ code, language, problem, onOutput }) {
  const tests = problem.testCases || [];
  const scratch = tests.length === 0;
  const functionName = problem.functionName?.[language] || 'solve';
  const limits = { timeoutMs: RUN_TIMEOUT_MS, memoryMb: null, cpus: null, network: 'browser' };

  if (!browserLanguages.includes(language)) {
    onOutput('system', 'C++ needs the full interview server, which is offline right now, so this code was not executed.');
    onOutput('system', 'Keep going: the interviewer can still review your code. Switch to Python or JavaScript to run it in the browser.');
    return Promise.resolve({ mode: scratch ? 'scratch' : 'tests', status: 'unavailable', passed: 0, total: tests.length, durationMs: 0, compileMs: 0, timedOut: false, exitCode: null, error: 'C++ cannot run while the server is offline', stderr: '', stdoutTail: '', limits, results: [] });
  }

  return new Promise((resolve) => {
    const records = [];
    const stdoutTail = [];
    const stderrLines = [];
    let loadError = null;
    let runtimeError = null;
    let timedOut = false;
    let started = performance.now();
    let killTimer;
    let worker;

    if (language === 'python') {
      if (!pyWorker) {
        pyWorker = makeWorker(PY_WORKER);
        pyReady = false;
      }
      worker = pyWorker;
      if (!pyReady) onOutput('system', 'Loading Python in your browser (a few seconds)…');
    } else {
      worker = makeWorker(JS_WORKER);
    }

    const armTimer = (ms) => {
      clearTimeout(killTimer);
      killTimer = setTimeout(() => {
        timedOut = true;
        finish(true);
      }, ms);
    };

    const finish = (kill) => {
      clearTimeout(killTimer);
      worker.onmessage = null;
      if (kill || language === 'javascript') worker.terminate();
      if (kill && language === 'python') {
        pyWorker = null; // a runaway Python loop cannot be interrupted: discard the worker
        pyReady = false;
      }
      const durationMs = Math.round(performance.now() - started);
      const results = tests.map((test, index) => {
        const rec = records[index];
        const base = { index, hidden: Boolean(test.hidden), ms: rec?.ms ?? null };
        let outcome;
        if (!rec) outcome = { passed: false, status: timedOut ? 'timeout' : 'not_run' };
        else if (!rec.ok) outcome = { passed: false, status: 'error', error: rec.error };
        else {
          const passed = matches(rec.actual, test.expected, problem.compare);
          outcome = { passed, status: passed ? 'passed' : 'failed', actual: preview(rec.actual) };
        }
        if (test.hidden) return { ...base, passed: outcome.passed, status: outcome.status };
        return { ...base, ...outcome, input: preview(test.input), expected: preview(test.expected), stdout: rec?.stdout || '' };
      });
      const passed = results.filter((r) => r.passed).length;
      let status = scratch ? 'completed' : 'accepted';
      if (loadError) status = 'compile_error';
      else if (timedOut) status = 'timeout';
      else if (runtimeError || results.some((r) => r.status === 'error')) status = 'runtime_error';
      else if (!scratch && passed !== tests.length) status = 'wrong_answer';
      resolve({
        mode: scratch ? 'scratch' : 'tests', status, passed, total: tests.length, durationMs, compileMs: 0, timedOut, oomKilled: false,
        exitCode: status === 'completed' || status === 'accepted' ? 0 : 1, error: loadError || runtimeError, stderr: stderrLines.slice(-40).join('\n'),
        stdoutTail: stdoutTail.join('\n'), limits, results,
      });
    };

    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        if (!pyReady) onOutput('system', 'Python is ready.');
        pyReady = true;
        started = performance.now();
        armTimer(RUN_TIMEOUT_MS); // the run limit starts once Python has loaded
      } else if (data.type === 'line') {
        for (const line of String(data.text).split('\n')) {
          if (!line) continue;
          if (data.stream === 'stderr') stderrLines.push(line);
          else if (!line.startsWith('> test ')) {
            stdoutTail.push(line);
            if (stdoutTail.length > 40) stdoutTail.shift();
          }
          onOutput(data.stream, line);
        }
      } else if (data.type === 'test') records[data.result.index] = data.result;
      else if (data.type === 'load_error') {
        loadError = data.message;
        onOutput('stderr', data.message);
        finish(false);
      } else if (data.type === 'runtime_error') {
        runtimeError = data.message;
        finish(false);
      } else if (data.type === 'done') finish(false);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      runtimeError = event.message || 'The worker crashed';
      onOutput('stderr', runtimeError);
      finish(true);
    };

    armTimer(language === 'python' && !pyReady ? PYODIDE_LOAD_TIMEOUT_MS : RUN_TIMEOUT_MS);
    worker.postMessage({ code, functionName, tests: scratch ? [] : tests.map((t) => t.input) });
  });
}
