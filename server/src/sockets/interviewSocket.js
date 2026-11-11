// Socket.io orchestration: one room per interview. Bridges editor/voice events to the AI agent
// and BullMQ job events back to the browser.
import { z } from 'zod';
import { allow } from '../middleware/rateLimit.js';
import { Interview } from '../models/Interview.js';
import { toPublicProblem } from '../models/Problem.js';
import { createQueueEvents, executionQueue, QUEUES } from '../queues/index.js';
import * as agent from '../services/aiAgent.js';
import { appendTranscript, endInterview, loadContext, roomOf } from '../services/interviewService.js';
import * as state from '../services/interviewState.js';
import { log } from '../utils/logger.js';

const REVIEW_DEBOUNCE_MS = 1500;

const schemas = {
  join: z.object({ interviewId: z.string().regex(/^[a-f0-9]{24}$/) }),
  code: z.object({ code: z.string().max(60_000), cursorLine: z.number().int().min(1).max(100_000).optional() }),
  message: z.object({ text: z.string().trim().min(1).max(2000), viaVoice: z.boolean().optional() }),
};

const safe = (socket, handler) => async (payload, ack) => {
  try {
    const result = await handler(payload ?? {});
    if (typeof ack === 'function') ack({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof z.ZodError ? 'Invalid payload' : err.message;
    if (!(err instanceof z.ZodError)) log.warn(`[socket] ${message}`);
    if (typeof ack === 'function') ack({ ok: false, error: message });
    else socket.emit('server:error', { message });
  }
};

export function registerInterviewSocket(io) {
  io.on('connection', (socket) => {
    let ctx = null;
    let reviewTimer = null;
    const emit = (event, payload) => io.to(ctx.room).emit(event, payload);
    const limited = async (name, limit, windowSec) => {
      if (!(await allow(`sock:${ctx?.interviewId || socket.id}:${name}`, limit, windowSec))) throw new Error('Rate limit exceeded, slow down.');
    };
    const requireCtx = () => {
      if (!ctx) throw new Error('Join an interview first.');
    };

    socket.on('interview:join', safe(socket, async (payload) => {
      const { interviewId } = schemas.join.parse(payload);
      const loaded = await loadContext(interviewId);
      if (!loaded) throw new Error('Interview not found');
      ctx = loaded;
      await socket.join(ctx.room);

      const interview = await Interview.findById(interviewId).select('status transcript startedAt reportStatus finalCode hintsUsed').lean();
      const editor = (await state.getEditor(interviewId)) || { code: interview.finalCode || ctx.problem.starterCode?.[ctx.language] || '', language: ctx.language, cursorLine: 1 };

      // Greet exactly once, even if the tab reconnects or is opened twice.
      if (interview.status === 'active' && interview.transcript.length === 0 && (await state.acquire(interviewId, 'greeted', 6 * 3600))) {
        // Start after the join acknowledgement has been sent, so the client has its state first.
        setTimeout(() => agent.greet(ctx, emit).catch((err) => log.error(`greet failed: ${err.message}`)), 150);
      }

      return {
        interview: { id: interviewId, candidateName: ctx.candidateName, language: ctx.language, status: interview.status, startedAt: interview.startedAt, reportStatus: interview.reportStatus },
        problem: toPublicProblem(ctx.problem),
        code: editor.code,
        hints: (ctx.problem.hints || []).slice(0, interview.hintsUsed || 0),
        transcript: interview.transcript.filter((t) => t.role !== 'system'),
        aiMode: agent.llmEnabled ? 'llm' : 'rule-based',
      };
    }));

    socket.on('code:change', safe(socket, async (payload) => {
      requireCtx();
      await limited('code', 600, 60);
      const { code, cursorLine } = schemas.code.parse(payload);
      await state.setEditor(ctx.interviewId, { code, language: ctx.language, cursorLine });

      // Review once the candidate pauses typing, not on every keystroke.
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(() => {
        agent.reviewCode(ctx, emit, 'auto').catch((err) => log.error(`review failed: ${err.message}`));
      }, REVIEW_DEBOUNCE_MS);
    }));

    socket.on('code:run', safe(socket, async (payload) => {
      requireCtx();
      await limited('run', 12, 60);
      if (ctx.problem.type !== 'coding') throw new Error('This problem has no runnable tests.');
      if (payload.code !== undefined) {
        const { code, cursorLine } = schemas.code.parse(payload);
        await state.setEditor(ctx.interviewId, { code, language: ctx.language, cursorLine });
      }
      const editor = await state.getEditor(ctx.interviewId);
      if (!editor?.code?.trim()) throw new Error('Nothing to run yet.');

      clearTimeout(reviewTimer);
      // "Can we optimise that before running tests?": review in parallel, do not block execution.
      agent.reviewCode(ctx, emit, 'pre-run').catch((err) => log.error(`review failed: ${err.message}`));

      const job = await executionQueue.add('run', { interviewId: ctx.interviewId, problemId: String(ctx.problem._id), code: editor.code, language: ctx.language });
      emit('run:queued', { jobId: job.id });
      return { jobId: job.id };
    }));

    socket.on('candidate:message', safe(socket, async (payload) => {
      requireCtx();
      await limited('msg', 30, 60);
      const { text, viaVoice } = schemas.message.parse(payload);
      await appendTranscript(ctx.interviewId, { role: 'candidate', kind: 'message', text, meta: { viaVoice: Boolean(viaVoice) } });
      socket.to(ctx.room).emit('candidate:message', { text, viaVoice });
      agent.respond(ctx, emit, text).catch((err) => log.error(`respond failed: ${err.message}`));
    }));

    // Candidate started talking over the interviewer (barge-in).
    socket.on('candidate:barge-in', safe(socket, async () => {
      requireCtx();
      agent.cancelSpeech(ctx.interviewId);
    }));

    socket.on('ai:review', safe(socket, async () => {
      requireCtx();
      await limited('review', 10, 60);
      const interruption = await agent.reviewCode(ctx, emit, 'manual');
      if (!interruption) {
        await agent.respond(ctx, emit, '[event] The candidate pressed "Review my code". Give a brief, honest assessment of the current code: its time and space complexity and the single most important thing to look at next.');
      }
    }));

    // Hints are revealed one at a time, in order, and each one is counted against the candidate.
    socket.on('hint:request', safe(socket, async () => {
      requireCtx();
      await limited('hint', 10, 60);
      const hints = ctx.problem.hints || [];
      const updated = await Interview.findOneAndUpdate(
        { _id: ctx.interviewId, status: 'active', hintsUsed: { $lt: hints.length } },
        { $inc: { hintsUsed: 1 } },
        { returnDocument: 'after' },
      ).select('hintsUsed').lean();
      if (!updated) throw new Error(hints.length ? 'You have seen every hint for this problem.' : 'This problem has no hints.');

      const index = updated.hintsUsed - 1;
      const payload = { index, total: hints.length, text: hints[index] };
      await appendTranscript(ctx.interviewId, { role: 'system', kind: 'event', text: `Candidate revealed hint ${index + 1} of ${hints.length}: ${hints[index]}` });
      await state.pushHistory(ctx.interviewId, 'user', `[event] The candidate revealed written hint ${index + 1} of ${hints.length}: "${hints[index]}". Do not repeat it. If they are still stuck, build on it.`);
      emit('hint:revealed', payload);
      return payload;
    }));

    socket.on('interview:end', safe(socket, async () => {
      requireCtx();
      clearTimeout(reviewTimer);
      agent.cancelSpeech(ctx.interviewId);
      const result = await endInterview(ctx.interviewId);
      emit('interview:ended', { reportStatus: result.reportStatus });
      return result;
    }));

    socket.on('disconnect', () => clearTimeout(reviewTimer));
  });
}

const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

/** Forward BullMQ job lifecycle events to the right interview room. */
export function bridgeQueueEvents(io) {
  const execution = createQueueEvents(QUEUES.EXECUTION);
  const report = createQueueEvents(QUEUES.REPORT);

  execution.on('progress', ({ jobId, data }) => {
    const line = parse(data);
    if (line?.interviewId) io.to(roomOf(line.interviewId)).emit('terminal:line', { jobId, stream: line.stream, text: line.text });
  });

  execution.on('completed', async ({ jobId, returnvalue }) => {
    try {
      const result = parse(returnvalue);
      const room = roomOf(result.interviewId);
      if (!io.sockets.adapter.rooms.has(room)) return;
      io.to(room).emit('run:result', { jobId, ...result });
      // Every API instance sees this event; only one should make the interviewer talk.
      if (!(await state.acquire(result.interviewId, `run-feedback:${jobId}`, 300))) return;
      const ctx = await loadContext(result.interviewId);
      if (ctx) await agent.commentOnRun(ctx, (event, payload) => io.to(room).emit(event, payload), result);
    } catch (err) {
      log.error(`run:result bridge failed: ${err.message}`);
    }
  });

  execution.on('failed', async ({ jobId, failedReason }) => {
    const job = await executionQueue.getJob(jobId).catch(() => null);
    if (job?.data?.interviewId) io.to(roomOf(job.data.interviewId)).emit('run:error', { jobId, message: failedReason });
  });

  report.on('completed', ({ returnvalue }) => {
    const result = parse(returnvalue);
    io.to(roomOf(result.interviewId)).emit('report:ready', { interviewId: result.interviewId });
  });

  return { close: () => Promise.allSettled([execution.close(), report.close()]) };
}
