// Live (hot) interview state in Redis: latest editor buffer, rolling LLM context, cooldowns.
import { redis } from '../config/redis.js';

const TTL_SEC = 6 * 3600;
const HISTORY_MAX = 40;
const key = (id, part) => `interview:${id}:${part}`;

export async function setEditor(id, { code, language, cursorLine }) {
  const k = key(id, 'editor');
  await redis
    .multi()
    .hset(k, { code, language, cursorLine: String(cursorLine ?? 1), updatedAt: String(Date.now()) })
    .expire(k, TTL_SEC)
    .exec();
}

export async function getEditor(id) {
  const data = await redis.hgetall(key(id, 'editor'));
  if (!data || data.code === undefined) return null;
  return { code: data.code, language: data.language, cursorLine: Number(data.cursorLine) || 1 };
}

export async function pushHistory(id, role, content) {
  const k = key(id, 'history');
  await redis
    .multi()
    .rpush(k, JSON.stringify({ role, content }))
    .ltrim(k, -HISTORY_MAX, -1)
    .expire(k, TTL_SEC)
    .exec();
}

export async function getHistory(id) {
  const raw = await redis.lrange(key(id, 'history'), 0, -1);
  const turns = raw.map((r) => JSON.parse(r));
  // The Messages API requires the first turn to be from the user.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

/** One-shot lock/cooldown. Returns true if this caller acquired it. */
export async function acquire(id, name, ttlSec) {
  const res = await redis.set(key(id, `lock:${name}`), '1', 'EX', ttlSec, 'NX');
  return res === 'OK';
}

export async function clear(id) {
  await redis.del(key(id, 'editor'), key(id, 'history'));
}
