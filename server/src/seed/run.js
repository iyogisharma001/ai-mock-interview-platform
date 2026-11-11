import { connectDb, disconnectDb } from '../config/db.js';
import { redis } from '../config/redis.js';
import { seedProblems } from './problems.js';

await connectDb();
await seedProblems();
await disconnectDb();
redis.disconnect();
