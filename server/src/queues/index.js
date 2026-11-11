import { Queue, QueueEvents } from 'bullmq';
import { createRedis } from '../config/redis.js';

export const QUEUES = {
  EXECUTION: 'code-execution',
  REPORT: 'report-generation',
};

export const executionQueue = new Queue(QUEUES.EXECUTION, {
  connection: createRedis('redis:queue:execution'),
  defaultJobOptions: {
    attempts: 1, // user code is not retried: a failure is a result, not an infra error
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600, count: 1000 },
  },
});

export const reportQueue = new Queue(QUEUES.REPORT, {
  connection: createRedis('redis:queue:report'),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export function createQueueEvents(name) {
  return new QueueEvents(name, { connection: createRedis(`redis:events:${name}`) });
}

export async function closeQueues() {
  await Promise.allSettled([executionQueue.close(), reportQueue.close()]);
}
