// CLIENT_ORIGIN is a comma-separated list. Each entry is an exact origin, a pattern with "*"
// standing for one hostname label or more (https://*.vercel.app), or a lone "*" for any origin.
import { env } from './env.js';

const entries = env.CLIENT_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
const exact = new Set(entries.filter((o) => !o.includes('*')));
const escapeRegex = (text) => text.replace(/[.+?^$(){}|[\]\\]/g, '\\$&');
const toPattern = (entry) => new RegExp('^' + entry.split('*').map(escapeRegex).join('[a-z0-9.-]+') + '$', 'i');
const patterns = entries.filter((o) => o.includes('*') && o !== '*').map(toPattern);

export const allowsAnyOrigin = entries.includes('*');

export function isAllowedOrigin(origin) {
  if (!origin || allowsAnyOrigin) return true; // no Origin header: curl, health checks, same-origin
  return exact.has(origin) || patterns.some((pattern) => pattern.test(origin));
}

/** Options object accepted by both the `cors` middleware and Socket.io. */
export const corsOptions = {
  origin: allowsAnyOrigin ? '*' : (origin, callback) => callback(null, isAllowedOrigin(origin)),
  methods: ['GET', 'POST'],
};

export const describeOrigins = () => (allowsAnyOrigin ? 'any origin (*)' : entries.join(', '));
