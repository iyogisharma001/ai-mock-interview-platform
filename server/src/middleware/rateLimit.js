import { redis } from '../config/redis.js';

/**
 * Fixed-window counter in Redis. Returns true when the call is allowed.
 * Fails open if Redis is unreachable so a cache blip does not take the API down.
 */
export async function allow(key, limit, windowSec) {
  try {
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSec);
    return count <= limit;
  } catch {
    return true;
  }
}

export function rateLimit({ prefix, limit, windowSec }) {
  return async (req, res, next) => {
    const ok = await allow(`${prefix}:${req.ip}`, limit, windowSec);
    if (ok) return next();
    res.set('Retry-After', String(windowSec));
    return res.status(429).json({ error: 'Too many requests. Slow down and try again shortly.' });
  };
}
