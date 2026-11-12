// Standalone mode's answers to the same questions the REST API answers.
import { catalogueMeta, getProblem, listProblems } from './catalogue.js';
import { createLocalInterview, isLocalId, loadInterview, loadReport } from './store.js';

export { catalogueMeta, isLocalId, listProblems };

export async function createInterview({ candidateName, problemSlug, language }) {
  const problem = await getProblem(problemSlug);
  if (!problem) throw new Error('Problem not found');
  const record = createLocalInterview({ candidateName: String(candidateName).trim().slice(0, 80), problem, language });
  return { id: record.id };
}

export async function interviewDetails(id) {
  const record = loadInterview(id);
  if (!record) throw new Error('This interview was not found in this browser.');
  const problem = await getProblem(record.problemSlug);
  return {
    id: record.id,
    candidateName: record.candidateName,
    language: record.language,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    reportStatus: record.reportStatus,
    problem: problem && { slug: problem.slug, title: problem.title, difficulty: problem.difficulty, type: problem.type },
    finalCode: record.code,
    transcript: record.transcript,
    runs: record.runs,
  };
}

export async function reportFor(id) {
  const record = loadInterview(id);
  if (!record) return { status: 'failed' };
  if (record.reportStatus === 'ready') return { status: 'ready', report: loadReport(id) };
  // A report that was still being written when the tab closed: write it now.
  // (Give the original writer, started when the interview ended, 90 seconds to finish first.)
  const stale = Date.now() - new Date(record.endedAt || 0).getTime() > 90_000;
  if (record.status === 'completed' && record.reportStatus !== 'ready' && stale) {
    const { writeLocalReport } = await import('../hooks/useLocalInterview.js');
    const { saveInterview, saveReport } = await import('./store.js');
    if (!pending.has(id)) {
      pending.set(id, (async () => {
        const problem = await getProblem(record.problemSlug);
        const report = await writeLocalReport(record, problem);
        saveReport(id, report);
        record.reportStatus = 'ready';
        saveInterview(record);
      })().finally(() => pending.delete(id)));
    }
    return { status: 'queued' };
  }
  return { status: record.reportStatus || 'none' };
}

const pending = new Map();
