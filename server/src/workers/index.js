import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { createRedis } from '../config/redis.js';
import { Interview } from '../models/Interview.js';
import { Problem } from '../models/Problem.js';
import { Report } from '../models/Report.js';
import { QUEUES } from '../queues/index.js';
import { generateReport } from '../services/aiAgent.js';
import { runInSandbox } from '../services/sandboxEngine.js';
import { log } from '../utils/logger.js';

async function processExecution(job) {
  const { interviewId, problemId, code, language } = job.data;
  const problem = await Problem.findById(problemId).lean();
  if (!problem) throw new Error('Problem not found');

  // Progress updates are awaited in order so terminal lines arrive in sequence.
  let chain = Promise.resolve();
  const onOutput = (stream, text) => {
    chain = chain.then(() => job.updateProgress({ interviewId, stream, text: text.slice(0, 2000) })).catch(() => {});
  };

  onOutput('system', `$ run ${language} · ${problem.testCases.length ? `${problem.testCases.length} tests` : 'scratch run'} · limits: ${env.SANDBOX_MEMORY_MB}MB / ${env.SANDBOX_CPUS} CPU / ${env.SANDBOX_TIMEOUT_MS}ms / no network`);
  const result = await runInSandbox({
    code,
    language,
    functionName: problem.functionName?.[language],
    signature: language === 'cpp' ? problem.cppSignature : undefined,
    tests: problem.testCases,
    compare: problem.compare,
    onOutput,
  });
  await chain;

  await Interview.updateOne(
    { _id: interviewId },
    { $push: { runs: { jobId: job.id, status: result.status, passed: result.passed, total: result.total, durationMs: result.durationMs, timedOut: result.timedOut } } },
  );
  return { interviewId, ...result };
}

async function processReport(job) {
  const { interviewId } = job.data;
  const interview = await Interview.findById(interviewId).lean();
  if (!interview) throw new Error('Interview not found');
  const problem = await Problem.findById(interview.problem).lean();

  // On the final attempt the report falls back to heuristics instead of failing outright.
  const report = await generateReport({ interview, problem, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts || 1 });
  await Report.findOneAndUpdate({ interview: interviewId }, { ...report, interview: interviewId }, { upsert: true, runValidators: true });
  await Interview.updateOne({ _id: interviewId }, { $set: { reportStatus: 'ready' } });
  return { interviewId, generatedBy: report.generatedBy };
}

export function startWorkers() {
  const execution = new Worker(QUEUES.EXECUTION, processExecution, {
    connection: createRedis('redis:worker:execution'),
    concurrency: env.EXECUTION_CONCURRENCY,
    lockDuration: 30_000,
  });
  const report = new Worker(QUEUES.REPORT, processReport, {
    connection: createRedis('redis:worker:report'),
    concurrency: env.REPORT_CONCURRENCY,
    lockDuration: 180_000,
  });

  execution.on('failed', (job, err) => log.error(`execution job ${job?.id} failed: ${err.message}`));
  report.on('failed', async (job, err) => {
    log.error(`report job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      await Interview.updateOne({ _id: job.data.interviewId }, { $set: { reportStatus: 'failed' } }).catch(() => {});
    }
  });

  log.info(`Workers started (execution x${env.EXECUTION_CONCURRENCY}, report x${env.REPORT_CONCURRENCY})`);
  return { close: () => Promise.allSettled([execution.close(), report.close()]) };
}
