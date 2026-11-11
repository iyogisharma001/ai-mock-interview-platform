import mongoose from 'mongoose';
import { Interview } from '../models/Interview.js';
import { Problem } from '../models/Problem.js';
import { reportQueue } from '../queues/index.js';
import * as state from './interviewState.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const roomOf = (interviewId) => `interview:${interviewId}`;

export async function createInterview({ candidateName, problemSlug, language }) {
  const problem = await Problem.findOne({ slug: problemSlug }).lean();
  if (!problem) throw new HttpError(404, 'Problem not found');
  const lang = problem.type === 'system-design' ? 'markdown' : language;
  if (problem.type === 'coding' && !['python', 'javascript', 'cpp'].includes(lang)) throw new HttpError(400, 'Unsupported language');

  const interview = await Interview.create({ candidateName, problem: problem._id, language: lang });
  await state.setEditor(String(interview._id), { code: problem.starterCode?.[lang] || '', language: lang, cursorLine: 1 });
  return interview;
}

// Immutable per-interview context, cached in-process (problem statements do not change mid-interview).
const contextCache = new Map();
const CONTEXT_CACHE_MAX = 500;

export async function loadContext(interviewId) {
  const id = String(interviewId);
  if (contextCache.has(id)) return contextCache.get(id);
  if (!mongoose.isValidObjectId(id)) return null;
  const interview = await Interview.findById(id).select('candidateName language problem status').lean();
  if (!interview) return null;
  const problem = await Problem.findById(interview.problem).lean();
  if (!problem) return null;
  const ctx = { interviewId: id, room: roomOf(id), candidateName: interview.candidateName, language: interview.language, problem };
  if (contextCache.size >= CONTEXT_CACHE_MAX) contextCache.delete(contextCache.keys().next().value);
  contextCache.set(id, ctx);
  return ctx;
}

export async function appendTranscript(interviewId, entry) {
  const update = { $push: { transcript: { ...entry, text: String(entry.text).slice(0, 8000), at: new Date() } } };
  if (entry.kind === 'interruption') update.$inc = { interruptions: 1 };
  await Interview.updateOne({ _id: interviewId }, update);
}

/** Idempotently finish an interview and enqueue report generation. */
export async function endInterview(interviewId) {
  const editor = await state.getEditor(interviewId);
  const interview = await Interview.findOneAndUpdate(
    { _id: interviewId, status: 'active' },
    { $set: { status: 'completed', endedAt: new Date(), reportStatus: 'queued', ...(editor ? { finalCode: editor.code } : {}) } },
    { returnDocument: 'after' },
  );
  if (!interview) {
    const existing = await Interview.findById(interviewId).select('reportStatus status').lean();
    if (!existing) throw new HttpError(404, 'Interview not found');
    return { alreadyEnded: true, reportStatus: existing.reportStatus };
  }
  // jobId de-duplicates: one report job per interview no matter how many times "end" is pressed.
  await reportQueue.add('generate', { interviewId: String(interviewId) }, { jobId: `report-${interviewId}` });
  return { alreadyEnded: false, reportStatus: 'queued' };
}
