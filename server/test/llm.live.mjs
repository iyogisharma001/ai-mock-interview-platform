// Live check of the Gemini integration. Makes three small real API calls, so it needs a key:
//   GEMINI_API_KEY=... npm run test:llm
// It never prints the key.
import assert from 'node:assert/strict';
import { z } from 'zod';

const { generateJson, llmEnabled, llmLabel, streamText } = await import('../src/services/llm.js');
if (!llmEnabled) {
  console.error('GEMINI_API_KEY is not set (or AI_MODE=mock): nothing to test.');
  process.exit(1);
}
console.log(`Provider: ${llmLabel}`);

const code = ['def two_sum(nums, target):', '    for i in range(len(nums)):', '        for j in range(i + 1, len(nums)):', '            if nums[i] + nums[j] == target:', '                return [i, j]'].join('\n');
const numbered = code.split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n');

// 1. Streaming, multi-turn, with editor context. Consecutive user turns must be accepted.
let started = Date.now();
let firstChunkMs = null;
let reply = '';
await streamText({
  system: 'You are a technical interviewer speaking aloud. Reply in one or two short plain sentences, no markdown.',
  messages: [
    { role: 'user', content: '[event] The interview started.' },
    { role: 'assistant', content: 'Hi, talk me through your approach to Two Sum.' },
    { role: 'user', content: '[event] The candidate typed code.' },
    { role: 'user', content: `Can you see my code? What line is the inner loop on?\n\n<editor language="python">\n${numbered}\n</editor>` },
  ],
  onDelta: (text) => {
    firstChunkMs ??= Date.now() - started;
    reply += text;
  },
});
console.log(`\n[stream] first words after ${firstChunkMs} ms, done in ${Date.now() - started} ms\n  "${reply.trim()}"`);
assert.ok(reply.trim().length > 10);
assert.match(reply, /\b(3|three)\b/i, 'the model should read the editor snapshot and name line 3');

// 2. Structured output with reasoning, as used for the interruption decision.
started = Date.now();
const verdict = await generateJson({
  system: 'You review code during an interview and decide whether to interrupt for a complexity problem.',
  prompt: `Target: O(n) time.\n\n<editor language="python">\n${numbered}\n</editor>`,
  thinkingBudget: 1024,
  schema: z.object({
    should_interrupt: z.boolean(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    time_complexity: z.string(),
    message: z.string(),
  }),
});
console.log(`\n[json] ${Date.now() - started} ms`, verdict);
assert.equal(verdict.should_interrupt, true);
assert.match(verdict.time_complexity.replace(/\s/g, ''), /n\^?2|n²|n\*n/i);

// 3. Aborting mid-stream must stop quietly (used when the candidate talks over the interviewer).
const controller = new AbortController();
let chunks = 0;
await streamText({
  system: 'You are verbose.',
  messages: [{ role: 'user', content: 'Count slowly from one to two hundred in words.' }],
  signal: controller.signal,
  onDelta: () => {
    chunks += 1;
    controller.abort();
  },
}).catch((err) => {
  if (!controller.signal.aborted) throw err;
});
console.log(`\n[abort] stopped after ${chunks} chunk(s)`);
assert.ok(chunks <= 3);

console.log('\n✔ Gemini integration works');
