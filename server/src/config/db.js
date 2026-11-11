import mongoose from 'mongoose';
import { env } from './env.js';
import { log } from '../utils/logger.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  log.info(`MongoDB connected (${mongoose.connection.name})`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
