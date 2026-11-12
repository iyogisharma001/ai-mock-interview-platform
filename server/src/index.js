import http from 'node:http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { corsOptions, describeOrigins } from './config/cors.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { rateLimit } from './middleware/rateLimit.js';
import { closeQueues } from './queues/index.js';
import { api, errorHandler } from './routes/api.js';
import { seedProblems } from './seed/problems.js';
import { llmEnabled, llmLabel } from './services/aiAgent.js';
import { bridgeQueueEvents, registerInterviewSocket } from './sockets/interviewSocket.js';
import { log } from './utils/logger.js';
import { startWorkers } from './workers/index.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // the client is on another origin
app.use(cors(corsOptions));
app.use(express.json({ limit: '200kb' }));
app.use('/api', rateLimit({ prefix: 'api', limit: 300, windowSec: 60 }), api);
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 256 * 1024,
  pingInterval: 20_000,
  pingTimeout: 20_000,
});

await connectDb();
await seedProblems();
registerInterviewSocket(io);
const bridge = bridgeQueueEvents(io);
const workers = env.RUN_WORKERS_INLINE ? startWorkers() : null;

server.listen(env.PORT, () => {
  log.info(`API + Socket.io listening on :${env.PORT}`);
  log.info(`Browser origins allowed: ${describeOrigins()}`);
  log.info(`AI interviewer: ${llmEnabled ? llmLabel : 'rule-based fallback (set GEMINI_API_KEY to enable the LLM)'}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  log.info(`${signal} received, shutting down…`);
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([workers?.close(), bridge.close()]);
  await closeQueues();
  await disconnectDb();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));
