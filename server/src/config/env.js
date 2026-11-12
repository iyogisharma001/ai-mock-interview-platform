import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

const str = (v, d) => (v === undefined || v === '' ? d : v);
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

export const env = {
  PORT: num(process.env.PORT, 4000),
  CLIENT_ORIGIN: str(process.env.CLIENT_ORIGIN, 'http://localhost:5173'),

  MONGO_URI: str(process.env.MONGO_URI, 'mongodb://127.0.0.1:27017/mock_interview'),
  REDIS_URL: str(process.env.REDIS_URL, 'redis://127.0.0.1:6379'),

  AI_MODE: str(process.env.AI_MODE, 'auto'),
  AI_MODEL: str(process.env.AI_MODEL, 'gemini-3.8-flash'),
  // Tried in order when the main model is overloaded, rate-limited or not offered to this key.
  AI_MODEL_FALLBACKS: str(process.env.AI_MODEL_FALLBACKS, 'gemini-3.5-flash,gemini-3.1-flash-lite'),

  RUN_WORKERS_INLINE: bool(process.env.RUN_WORKERS_INLINE, true),
  EXECUTION_CONCURRENCY: num(process.env.EXECUTION_CONCURRENCY, 4),
  REPORT_CONCURRENCY: num(process.env.REPORT_CONCURRENCY, 2),

  SANDBOX_IMAGE_PYTHON: str(process.env.SANDBOX_IMAGE_PYTHON, 'python:3.10-slim'),
  SANDBOX_IMAGE_JAVASCRIPT: str(process.env.SANDBOX_IMAGE_JAVASCRIPT, 'node:18-alpine'),
  SANDBOX_IMAGE_CPP: str(process.env.SANDBOX_IMAGE_CPP, 'gcc:13'),
  SANDBOX_COMPILE_TIMEOUT_MS: num(process.env.SANDBOX_COMPILE_TIMEOUT_MS, 20000),
  SANDBOX_COMPILE_MEMORY_MB: num(process.env.SANDBOX_COMPILE_MEMORY_MB, 512),
  SANDBOX_COMPILE_CPUS: num(process.env.SANDBOX_COMPILE_CPUS, 1),
  SANDBOX_TIMEOUT_MS: num(process.env.SANDBOX_TIMEOUT_MS, 5000),
  SANDBOX_MEMORY_MB: num(process.env.SANDBOX_MEMORY_MB, 128),
  SANDBOX_CPUS: num(process.env.SANDBOX_CPUS, 0.5),
  SANDBOX_AUTO_PULL: bool(process.env.SANDBOX_AUTO_PULL, true),
  // Name of a Docker volume mounted at SANDBOX_WORKDIR in this process (set when running in a container).
  SANDBOX_VOLUME: str(process.env.SANDBOX_VOLUME, ''),
  SANDBOX_WORKDIR: str(process.env.SANDBOX_WORKDIR, path.join(os.tmpdir(), 'interview-sandbox')),
};
