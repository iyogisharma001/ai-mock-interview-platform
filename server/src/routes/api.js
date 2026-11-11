import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { redis } from '../config/redis.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { Interview } from '../models/Interview.js';
import { Problem, toPublicProblem } from '../models/Problem.js';
import { Report } from '../models/Report.js';
import { SHEETS } from '../seed/catalog/index.js';
import { llmEnabled } from '../services/aiAgent.js';
import { createInterview, endInterview, HttpError } from '../services/interviewService.js';
import { pingDocker } from '../services/sandboxEngine.js';

export const api = Router();

const objectId = (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return next(new HttpError(400, 'Invalid id'));
  return next();
};

api.get('/health', async (_req, res) => {
  const [mongo, cache, docker] = await Promise.allSettled([
    mongoose.connection.db.admin().ping(),
    redis.ping(),
    pingDocker(),
  ]);
  const up = (r) => (r.status === 'fulfilled' ? 'up' : 'down');
  const body = { mongo: up(mongo), redis: up(cache), docker: up(docker), ai: llmEnabled ? 'llm' : 'rule-based' };
  res.status(body.mongo === 'up' && body.redis === 'up' ? 200 : 503).json(body);
});

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().trim().max(40).optional(),
  sheet: z.string().trim().max(40).optional(),
  tests: z.enum(['1']).optional(), // only problems with an automated test suite
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

api.get('/problems', async (req, res) => {
  const { q, difficulty, topic, sheet, tests, page, limit } = listSchema.parse(req.query);
  const filter = {};
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (difficulty) filter.difficulty = difficulty;
  if (topic) filter.topic = topic;
  if (sheet) filter.sheets = sheet;
  if (tests) filter['testCases.0'] = { $exists: true };

  const [total, problems] = await Promise.all([
    Problem.countDocuments(filter),
    Problem.find(filter)
      .select({ slug: 1, title: 1, type: 1, difficulty: 1, topic: 1, sheets: 1, sheetSection: 1, testCases: { $slice: 1 } })
      .sort({ order: 1, title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  res.json({
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    items: problems.map((p) => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      difficulty: p.difficulty,
      topic: p.topic,
      sheetSection: sheet ? p.sheetSection : '',
      hasTests: (p.testCases || []).length > 0,
    })),
  });
});

// Facets for the problem browser: topic counts, sheet counts and totals.
api.get('/problems/meta', async (_req, res) => {
  const [topics, sheets, total, withTests] = await Promise.all([
    Problem.aggregate([{ $group: { _id: '$topic', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Problem.aggregate([{ $unwind: '$sheets' }, { $group: { _id: '$sheets', count: { $sum: 1 } } }]),
    Problem.estimatedDocumentCount(),
    Problem.countDocuments({ 'testCases.0': { $exists: true } }),
  ]);
  res.json({
    total,
    withTests,
    topics: topics.filter((t) => t._id).map((t) => ({ name: t._id, count: t.count })),
    sheets: sheets.map((s) => ({ id: s._id, name: SHEETS[s._id] || s._id, count: s.count })),
  });
});

api.get('/problems/:slug', async (req, res) => {
  const problem = await Problem.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
  if (!problem) throw new HttpError(404, 'Problem not found');
  res.json(toPublicProblem(problem));
});

const createSchema = z.object({
  candidateName: z.string().trim().min(1).max(80),
  problemSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/),
  language: z.enum(['python', 'javascript', 'cpp']).default('python'),
});

api.post('/interviews', rateLimit({ prefix: 'create-interview', limit: 20, windowSec: 600 }), async (req, res) => {
  const interview = await createInterview(createSchema.parse(req.body));
  res.status(201).json({ id: String(interview._id) });
});

api.get('/interviews/:id', objectId, async (req, res) => {
  const interview = await Interview.findById(req.params.id).populate('problem', 'slug title difficulty type').lean();
  if (!interview) throw new HttpError(404, 'Interview not found');
  res.json({
    id: String(interview._id),
    candidateName: interview.candidateName,
    language: interview.language,
    status: interview.status,
    startedAt: interview.startedAt,
    endedAt: interview.endedAt,
    reportStatus: interview.reportStatus,
    problem: interview.problem,
    finalCode: interview.finalCode,
    transcript: interview.transcript,
    runs: interview.runs,
  });
});

api.post('/interviews/:id/end', objectId, async (req, res) => {
  res.json(await endInterview(req.params.id));
});

api.get('/interviews/:id/report', objectId, async (req, res) => {
  const interview = await Interview.findById(req.params.id).select('reportStatus status').lean();
  if (!interview) throw new HttpError(404, 'Interview not found');
  if (interview.reportStatus !== 'ready') return res.status(202).json({ status: interview.reportStatus });
  const report = await Report.findOne({ interview: req.params.id }).lean();
  return res.json({ status: 'ready', report });
});

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}
