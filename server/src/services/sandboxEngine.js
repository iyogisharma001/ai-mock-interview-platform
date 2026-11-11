// Secure ephemeral code execution: one throwaway, network-less, resource-capped container per run.
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Docker from 'dockerode';
import { env } from '../config/env.js';
import { log } from '../utils/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// DOCKER_SOCKET wins, then DOCKER_HOST (handled by dockerode), then the platform default.
// Docker Desktop on Windows exposes its Linux engine on a different named pipe than the classic one,
// so on win32 the first pipe that answers a ping is used.
let dockerPromise = null;
async function connectDocker() {
  if (process.env.DOCKER_SOCKET) return new Docker({ socketPath: process.env.DOCKER_SOCKET });
  if (process.env.DOCKER_HOST || process.platform !== 'win32') return new Docker();
  const candidates = ['//./pipe/docker_engine', '//./pipe/dockerDesktopLinuxEngine'].map((socketPath) => new Docker({ socketPath }));
  for (const candidate of candidates) {
    try {
      await candidate.ping();
      return candidate;
    } catch {
      /* try the next pipe */
    }
  }
  dockerPromise = null; // daemon may simply not be running yet: probe again on the next call
  return candidates[0];
}
const getDocker = () => (dockerPromise ??= connectDocker());

// Harness results (which include returned values) travel over stdout, so the byte cap is generous;
// what reaches the candidate's terminal is capped separately by line count.
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_TERMINAL_LINES = 400;
const MAX_CODE_BYTES = 64 * 1024;

const LANGUAGES = {
  python: {
    image: () => env.SANDBOX_IMAGE_PYTHON,
    solutionFile: 'solution.py',
    runnerSource: path.join(here, 'sandbox', 'runner.py'),
    runnerFile: 'runner.py',
    prepare: (code) => code,
    cmd: (sentinel) => ['python', '-u', '-B', '/workspace/runner.py', sentinel],
    scriptCmd: ['python', '-u', '-B', '/workspace/solution.py'],
    env: ['PYTHONDONTWRITEBYTECODE=1', 'PYTHONUNBUFFERED=1', 'PYTHONHASHSEED=0'],
  },
  javascript: {
    image: () => env.SANDBOX_IMAGE_JAVASCRIPT,
    solutionFile: 'solution.js',
    runnerSource: path.join(here, 'sandbox', 'runner.cjs'),
    runnerFile: 'runner.cjs',
    prepare: (code, fn) => `${code}\n;module.exports = typeof ${fn} === 'function' ? ${fn} : undefined;\n`,
    cmd: (sentinel) => ['node', '--max-old-space-size=96', '/workspace/runner.cjs', sentinel],
    scriptCmd: ['node', '--max-old-space-size=96', '/workspace/solution.js'],
    env: ['NODE_ENV=production'],
  },
  // Compiled: a first container builds /workspace/a.out with relaxed limits, then a second one
  // runs it under exactly the same limits as the interpreted languages.
  cpp: {
    image: () => env.SANDBOX_IMAGE_CPP,
    solutionFile: 'solution.cpp',
    runnerSource: path.join(here, 'sandbox', 'harness.h'),
    runnerFile: 'harness.h',
    prepare: (code) => code,
    extraFiles: (fn, signature) => ({ 'main.cpp': cppMain(fn, signature) }),
    compileCmd: (scratch) => ['g++', '-std=c++17', '-O2', '-pipe', '-w', '-o', '/workspace/a.out', scratch ? '/workspace/solution.cpp' : '/workspace/main.cpp'],
    cmd: (sentinel) => ['/workspace/a.out', sentinel],
    scriptCmd: ['/workspace/a.out'],
    env: [],
  },
};

const CPP_TYPE = /^(const\s+)?(int|long long|double|bool|char|string|vector<[\w<>\s]+>)\s*&?$/;

/** Generate the C++ entry point that feeds parsed test inputs to the candidate's function. */
function cppMain(fn, signature) {
  if (!signature?.ret || !Array.isArray(signature.params)) throw new Error('This problem has no C++ signature');
  for (const type of [signature.ret, ...signature.params]) if (!CPP_TYPE.test(type)) throw new Error(`Unsupported C++ type: ${type}`);
  const plain = (type) => type.replace(/^const\s+/, '').replace(/\s*&$/, '');
  const decls = signature.params.map((type, i) => `    ${plain(type)} a${i}; in.arg(a${i});`).join('\n');
  const args = signature.params.map((_, i) => `a${i}`).join(', ');
  return [
    '#include "harness.h"',
    '#define main candidate_main__ // a main() left in the solution must not clash with the harness',
    '#include "solution.cpp"',
    '#undef main',
    'int main(int argc, char** argv) {',
    '  return sbx::run(argc, argv, [](sbx::Reader& in, sbx::Writer& out) {',
    decls,
    `    out.value(${fn}(${args}));`,
    '  });',
    '}',
    '',
  ].join('\n');
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES);

/** Byte-capped sink that hands complete lines to a callback. */
class LineSink extends Writable {
  constructor(onLine) {
    super();
    this.onLine = onLine;
    this.bytes = 0;
    this.partial = '';
    this.truncated = false;
  }

  _write(chunk, _enc, done) {
    if (this.bytes < MAX_OUTPUT_BYTES) {
      const slice = chunk.subarray(0, MAX_OUTPUT_BYTES - this.bytes);
      this.bytes += slice.length;
      const parts = (this.partial + slice.toString('utf8')).split('\n');
      this.partial = parts.pop();
      for (const line of parts) this.onLine(line);
      if (this.bytes >= MAX_OUTPUT_BYTES) this.truncated = true;
    }
    done();
  }

  finish() {
    if (this.partial) this.onLine(this.partial);
    this.partial = '';
  }
}

const pulls = new Map();

/** Make sure a sandbox image exists locally (pulling it once if allowed). */
export async function ensureImage(image) {
  const docker = await getDocker();
  try {
    await docker.getImage(image).inspect();
    return;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  if (!env.SANDBOX_AUTO_PULL) throw new Error(`Sandbox image "${image}" is not available locally. Run: docker pull ${image}`);
  if (!pulls.has(image)) {
    log.info(`Pulling sandbox image ${image}…`);
    const pull = new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        return docker.modem.followProgress(stream, (doneErr) => (doneErr ? reject(doneErr) : resolve()));
      });
    }).finally(() => pulls.delete(image));
    pulls.set(image, pull);
  }
  await pulls.get(image);
}

export async function pingDocker() {
  await (await getDocker()).ping();
}

function normalise(value, compare) {
  const plain = value === undefined ? null : JSON.parse(JSON.stringify(value));
  if (compare === 'sorted' && Array.isArray(plain)) return [...plain].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return plain;
}

function matches(actual, expected, compare) {
  if (typeof actual === 'number' && typeof expected === 'number') return Math.abs(actual - expected) < 1e-6;
  return isDeepStrictEqual(normalise(actual, compare), normalise(expected, compare));
}

const preview = (value) => {
  const text = JSON.stringify(value);
  return text === undefined ? 'undefined' : text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

/**
 * Run candidate code in an isolated container.
 *
 * With tests, the harness calls `functionName` once per test and the host grades the results.
 * With no tests (a "scratch run"), the file is executed as a script and its output is streamed back.
 *
 * @param {object} args
 * @param {string} args.code
 * @param {'python'|'javascript'} args.language
 * @param {string} args.functionName entry point the tests call
 * @param {Array<{input:any[], expected:any, hidden?:boolean}>} args.tests
 * @param {'exact'|'sorted'} [args.compare]
 * @param {(stream:'stdout'|'stderr'|'system', text:string)=>void} [args.onOutput] live terminal lines
 */
/** Run one locked-down container to completion and report how it ended. */
async function execContainer(docker, { image, cmd, envVars, workspace, writable = false, runId, memoryMb, cpus, timeoutMs, tmpMb = 16, fileMb = 8, stdout, stderr }) {
  let container;
  let timedOut = false;
  try {
    container = await docker.createContainer({
      Image: image,
      Cmd: cmd,
      Env: envVars,
      WorkingDir: '/workspace',
      User: '65534:65534', // nobody
      NetworkDisabled: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      OpenStdin: false,
      Labels: { 'mock-interview.sandbox': 'true', 'mock-interview.run': runId },
      HostConfig: {
        // Containerised deployments share the workspace through a named volume (one sub-directory
        // per run), which works whatever the host's paths are. Otherwise bind the host directory.
        ...(env.SANDBOX_VOLUME
          ? { Mounts: [{ Type: 'volume', Source: env.SANDBOX_VOLUME, Target: '/workspace', ReadOnly: !writable, VolumeOptions: { Subpath: runId } }] }
          : { Binds: [`${workspace}:/workspace:${writable ? 'rw' : 'ro'}`] }),
        NetworkMode: 'none',
        Memory: memoryMb * 1024 * 1024,
        MemorySwap: memoryMb * 1024 * 1024, // equal to Memory = no swap
        CpuPeriod: 100_000,
        CpuQuota: Math.round(cpus * 100_000),
        PidsLimit: 64,
        ReadonlyRootfs: true,
        Tmpfs: { '/tmp': `rw,noexec,nosuid,size=${tmpMb}m` },
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }, { Name: 'fsize', Soft: fileMb * 1024 * 1024, Hard: fileMb * 1024 * 1024 }],
        AutoRemove: false,
      },
    });

    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    container.modem.demuxStream(stream, stdout, stderr);
    const drained = new Promise((resolve) => {
      stream.once('end', resolve);
      stream.once('close', resolve);
    });

    await container.start();
    const killTimer = setTimeout(() => {
      timedOut = true;
      container.kill().catch(() => {});
    }, timeoutMs);

    let exitCode = null;
    try {
      exitCode = (await container.wait()).StatusCode;
    } finally {
      clearTimeout(killTimer);
    }

    await Promise.race([drained, new Promise((r) => setTimeout(r, 500))]);
    stdout.finish();
    stderr.finish();
    const info = await container.inspect().catch(() => null);
    return { exitCode, timedOut, oomKilled: Boolean(info?.State?.OOMKilled) };
  } finally {
    if (container) await container.remove({ force: true, v: true }).catch((err) => log.warn(`sandbox cleanup: ${err.message}`));
  }
}

export async function runInSandbox({ code, language, functionName, signature, tests = [], compare = 'exact', onOutput: emitLine = () => {} }) {
  const scratch = tests.length === 0;
  let forwarded = 0;
  const onOutput = (stream, text) => {
    forwarded += 1;
    if (forwarded <= MAX_TERMINAL_LINES) emitLine(stream, text);
    else if (forwarded === MAX_TERMINAL_LINES + 1) emitLine('system', `… output truncated after ${MAX_TERMINAL_LINES} lines`);
  };
  const lang = LANGUAGES[language];
  if (!lang) throw new Error(`Unsupported language: ${language}`);
  if (!scratch && !/^[A-Za-z_]\w*$/.test(functionName || '')) throw new Error('Invalid function name');
  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) throw new Error('Source file is too large');

  const runId = randomUUID();
  const sentinel = `__SBX_${randomBytes(12).toString('hex')}__`;
  const workspace = path.join(env.SANDBOX_WORKDIR, runId);
  const image = lang.image();

  const docker = await getDocker();
  await ensureImage(image);
  const extraFiles = !scratch && lang.extraFiles ? lang.extraFiles(functionName, signature) : {};
  await fs.mkdir(workspace, { recursive: true });
  if (lang.compileCmd) await fs.chmod(workspace, 0o777); // the unprivileged compiler writes the binary here
  await Promise.all(scratch ? [fs.writeFile(path.join(workspace, lang.solutionFile), code)] : [
    fs.writeFile(path.join(workspace, lang.solutionFile), lang.prepare(code, functionName)),
    fs.copyFile(lang.runnerSource, path.join(workspace, lang.runnerFile)),
    // Inputs only. Expected outputs stay on the host.
    fs.writeFile(path.join(workspace, 'tests.json'), JSON.stringify({ functionName, tests: tests.map((t) => t.input) })),
    ...Object.entries(extraFiles).map(([name, content]) => fs.writeFile(path.join(workspace, name), content)),
  ]);

  const records = [];
  let loadError = null;
  let finished = false;
  const stderrLines = [];
  const stdoutLines = [];

  const stdout = new LineSink((line) => {
    if (line.startsWith(sentinel)) {
      try {
        const msg = JSON.parse(line.slice(sentinel.length));
        if (msg.type === 'test') records[msg.index] = msg;
        else if (msg.type === 'load_error') loadError = msg.message;
        else if (msg.type === 'done') finished = true;
      } catch {
        /* malformed harness line: ignore */
      }
    } else if (line.length) {
      stdoutLines.push(line);
      if (stdoutLines.length > 40) stdoutLines.shift();
      onOutput('stdout', line);
    }
  });
  const stderr = new LineSink((line) => {
    stderrLines.push(line);
    onOutput('stderr', line);
  });

  let timedOut = false;
  let oomKilled = false;
  let exitCode = null;
  let compileMs = 0;
  let started = Date.now();

  try {
    if (lang.compileCmd) {
      // Compilation gets more memory, CPU and time than the run, and its own clock.
      const diagnostics = [];
      const build = await execContainer(docker, {
        image,
        cmd: lang.compileCmd(scratch),
        envVars: lang.env,
        workspace,
        writable: true,
        runId,
        memoryMb: env.SANDBOX_COMPILE_MEMORY_MB,
        cpus: env.SANDBOX_COMPILE_CPUS,
        timeoutMs: env.SANDBOX_COMPILE_TIMEOUT_MS,
        tmpMb: 128,
        fileMb: 64,
        stdout: new LineSink((line) => diagnostics.push(line)),
        stderr: new LineSink((line) => diagnostics.push(line)),
      });
      compileMs = Date.now() - started;
      if (build.timedOut) loadError = `Compilation took longer than ${env.SANDBOX_COMPILE_TIMEOUT_MS / 1000} seconds`;
      else if (build.exitCode !== 0) {
        const shown = diagnostics.map((l) => l.replaceAll('/workspace/', '')).filter((l) => l.trim()).slice(0, 30);
        for (const line of shown) onOutput('stderr', line);
        stderrLines.push(...shown);
        loadError = shown.find((l) => /error/i.test(l)) || 'Compilation failed';
      } else onOutput('system', `compiled in ${compileMs} ms`);
    }

    if (!loadError) {
      started = Date.now();
      ({ exitCode, timedOut, oomKilled } = await execContainer(docker, {
        image,
        cmd: scratch ? lang.scriptCmd : lang.cmd(sentinel),
        envVars: lang.env,
        workspace,
        runId,
        memoryMb: env.SANDBOX_MEMORY_MB,
        cpus: env.SANDBOX_CPUS,
        timeoutMs: env.SANDBOX_TIMEOUT_MS,
        stdout,
        stderr,
      }));
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }

  const durationMs = Date.now() - started;
  const results = tests.map((test, index) => {
    const rec = records[index];
    const base = { index, hidden: Boolean(test.hidden), ms: rec?.ms ?? null };
    let outcome;
    if (!rec) outcome = { passed: false, status: timedOut ? 'timeout' : oomKilled ? 'memory' : 'not_run' };
    else if (!rec.ok) outcome = { passed: false, status: 'error', error: rec.error };
    else outcome = { passed: matches(rec.actual, test.expected, compare), status: 'ran', actual: preview(rec.actual) };
    if (outcome.status === 'ran') outcome.status = outcome.passed ? 'passed' : 'failed';
    // Hidden tests never leak their inputs, expected values or the candidate's raw output.
    if (test.hidden) return { ...base, passed: outcome.passed, status: outcome.status };
    return { ...base, ...outcome, input: preview(test.input), expected: preview(test.expected), stdout: rec?.stdout || '' };
  });

  const passed = results.filter((r) => r.passed).length;
  let status = scratch ? 'completed' : 'accepted';
  if (loadError) status = 'compile_error';
  else if (timedOut) status = 'timeout';
  else if (oomKilled) status = 'memory_limit';
  else if (results.some((r) => r.status === 'error') || (!finished && exitCode !== 0)) status = 'runtime_error';
  else if (!scratch && passed !== tests.length) status = 'wrong_answer';

  return {
    runId,
    mode: scratch ? 'scratch' : 'tests',
    status,
    passed,
    total: tests.length,
    durationMs,
    compileMs,
    timedOut,
    oomKilled,
    exitCode,
    error: loadError,
    stderr: stderrLines.slice(-40).join('\n'),
    stdoutTail: scratch ? stdoutLines.join('\n') : '',
    outputTruncated: stdout.truncated || stderr.truncated,
    limits: { timeoutMs: env.SANDBOX_TIMEOUT_MS, memoryMb: env.SANDBOX_MEMORY_MB, cpus: env.SANDBOX_CPUS, network: 'none' },
    results,
  };
}
