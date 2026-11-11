import IORedis from 'ioredis';
import { env } from './env.js';
import { log } from '../utils/logger.js';

// BullMQ requires maxRetriesPerRequest: null on its (blocking) connections.
export function createRedis(name = 'redis') {
  const conn = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  conn.on('error', (err) => log.error(`[${name}] ${err.message}`));
  return conn;
}

// Shared connection for app state, cooldowns and rate limiting.
export const redis = createRedis('redis:app');
