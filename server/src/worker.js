// Standalone worker process: `npm run worker`. Scale these horizontally, independent of the API.
import { connectDb, disconnectDb } from './config/db.js';
import { log } from './utils/logger.js';
import { startWorkers } from './workers/index.js';

await connectDb();
const workers = startWorkers();

const shutdown = async (signal) => {
  log.info(`${signal} received, draining workers…`);
  await workers.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
