import { Problem } from '../models/Problem.js';
import { log } from '../utils/logger.js';
import { buildCatalogue, slugify } from './catalog/index.js';
import { RUNNABLE, buildRunnable, cppFields } from './catalog/runnable.js';

// C++ signatures for the hand-written problems below: [return type, ...parameter types].
const HANDWRITTEN_CPP = {
  'two-sum': { fn: 'twoSum', types: ['vector<int>', 'vector<int>&', 'int'], names: ['nums', 'target'] },
  'longest-substring-without-repeating-characters': { fn: 'lengthOfLongestSubstring', types: ['int', 'string'], names: ['s'] },
  'maximum-subarray': { fn: 'maxSubarray', types: ['int', 'vector<int>&'], names: ['nums'] },
  'valid-parentheses': { fn: 'isValid', types: ['bool', 'string'], names: ['s'] },
  'merge-intervals': { fn: 'mergeIntervals', types: ['vector<vector<int>>', 'vector<vector<int>>&'], names: ['intervals'] },
};

// Large hidden input: quadratic solutions hit the sandbox's 5 s wall, linear ones finish instantly.
const bigTwoSum = Array.from({ length: 12000 }, (_, i) => i + 1);

export const PROBLEMS = [
  {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    tags: ['array', 'hash map'],
    description: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

Each input has exactly one solution, and you may not use the same element twice. You can return the two indices in any order.

Example 1
  Input: nums = [2, 7, 11, 15], target = 9
  Output: [0, 1]

Example 2
  Input: nums = [3, 2, 4], target = 6
  Output: [1, 2]

Constraints
  2 <= nums.length <= 100,000
  Exactly one valid answer exists.`,
    functionName: { python: 'two_sum', javascript: 'twoSum' },
    starterCode: {
      python: 'def two_sum(nums, target):\n    # Return the indices of the two numbers that add up to target.\n    pass\n',
      javascript: 'function twoSum(nums, target) {\n  // Return the indices of the two numbers that add up to target.\n}\n',
    },
    compare: 'sorted',
    expectedTime: 'O(n)',
    expectedSpace: 'O(n)',
    hints: [
      'For each number, what other number are you looking for?',
      'Is there a structure that can answer "have I already seen this value?" in constant time?',
      'Store each value with its index as you scan, and look up the complement before inserting.',
    ],
    rubric: 'Brute force is the nested pair scan. Optimal is a single pass with a hash map from value to index.',
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
      { input: [[3, 3], 6], expected: [0, 1] },
      { input: [[1, 5, 8, -2, 12], 10], expected: [3, 4], hidden: true },
      { input: [bigTwoSum, 23999], expected: [11998, 11999], hidden: true },
    ],
  },
  {
    slug: 'longest-substring-without-repeating-characters',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    tags: ['string', 'sliding window'],
    description: `Given a string \`s\`, return the length of the longest substring that contains no repeated characters.

Example 1
  Input: s = "abcabcbb"
  Output: 3   ("abc")

Example 2
  Input: s = "bbbbb"
  Output: 1

Example 3
  Input: s = "pwwkew"
  Output: 3   ("wke")

Constraints
  0 <= s.length <= 50,000`,
    functionName: { python: 'length_of_longest_substring', javascript: 'lengthOfLongestSubstring' },
    starterCode: {
      python: 'def length_of_longest_substring(s):\n    pass\n',
      javascript: 'function lengthOfLongestSubstring(s) {\n}\n',
    },
    expectedTime: 'O(n)',
    expectedSpace: 'O(min(n, alphabet))',
    hints: [
      'If you know the best window ending at position i, what changes at position i + 1?',
      'Keep a window with two pointers and shrink it from the left when a duplicate appears.',
      'Remember the last index of each character so the left pointer can jump instead of crawl.',
    ],
    rubric: 'Brute force checks every substring (cubic or quadratic). Optimal is a sliding window with a last-seen map.',
    testCases: [
      { input: ['abcabcbb'], expected: 3 },
      { input: ['bbbbb'], expected: 1 },
      { input: ['pwwkew'], expected: 3 },
      { input: [''], expected: 0, hidden: true },
      { input: ['dvdf'], expected: 3, hidden: true },
      { input: ['abcdefghijklmnopqrstuvwxyz'.repeat(300)], expected: 26, hidden: true },
    ],
  },
  {
    slug: 'maximum-subarray',
    title: 'Maximum Subarray',
    difficulty: 'medium',
    tags: ['array', 'dynamic programming'],
    description: `Given an integer array \`nums\`, find the contiguous subarray with the largest sum and return that sum. The subarray must contain at least one number.

Example 1
  Input: nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
  Output: 6   ([4, -1, 2, 1])

Example 2
  Input: nums = [5, 4, -1, 7, 8]
  Output: 23

Constraints
  1 <= nums.length <= 100,000`,
    functionName: { python: 'max_subarray', javascript: 'maxSubarray' },
    starterCode: {
      python: 'def max_subarray(nums):\n    pass\n',
      javascript: 'function maxSubarray(nums) {\n}\n',
    },
    expectedTime: 'O(n)',
    expectedSpace: 'O(1)',
    hints: [
      'At each index, the best subarray ending here either extends the previous one or starts fresh.',
      'When is it better to drop everything before the current element?',
    ],
    rubric: 'Brute force enumerates all start/end pairs. Optimal is Kadane\'s algorithm. Watch for the all-negative case.',
    testCases: [
      { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { input: [[1]], expected: 1 },
      { input: [[5, 4, -1, 7, 8]], expected: 23 },
      { input: [[-3, -1, -2]], expected: -1, hidden: true },
      { input: [Array.from({ length: 12000 }, (_, i) => (i % 7 === 0 ? -5 : 2))], expected: 12003, hidden: true },
    ],
  },
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    tags: ['string', 'stack'],
    description: `Given a string \`s\` containing only the characters ( ) { } [ ], decide whether it is valid.

A string is valid when every opening bracket is closed by the same type of bracket, and brackets close in the correct order.

Example 1
  Input: s = "()[]{}"
  Output: true

Example 2
  Input: s = "(]"
  Output: false

Constraints
  1 <= s.length <= 10,000`,
    functionName: { python: 'is_valid', javascript: 'isValid' },
    starterCode: {
      python: 'def is_valid(s):\n    pass\n',
      javascript: 'function isValid(s) {\n}\n',
    },
    expectedTime: 'O(n)',
    expectedSpace: 'O(n)',
    hints: [
      'Which opening bracket must a closing bracket match: the first one seen, or the most recent?',
      'A stack gives you the most recent unmatched opener in constant time.',
    ],
    rubric: 'Stack of openers. Repeated string replacement of "()" etc. is quadratic and should be challenged.',
    testCases: [
      { input: ['()'], expected: true },
      { input: ['()[]{}'], expected: true },
      { input: ['(]'], expected: false },
      { input: ['([)]'], expected: false, hidden: true },
      { input: ['{[]}'], expected: true, hidden: true },
      { input: ['('], expected: false, hidden: true },
      { input: [']'], expected: false, hidden: true },
    ],
  },
  {
    slug: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'medium',
    tags: ['array', 'sorting'],
    description: `Given an array of intervals where intervals[i] = [start, end], merge all overlapping intervals and return the non-overlapping intervals that cover the same ranges, sorted by start.

Intervals that touch at an endpoint count as overlapping.

Example 1
  Input: [[1, 3], [2, 6], [8, 10], [15, 18]]
  Output: [[1, 6], [8, 10], [15, 18]]

Example 2
  Input: [[1, 4], [4, 5]]
  Output: [[1, 5]]

Constraints
  1 <= intervals.length <= 10,000`,
    functionName: { python: 'merge_intervals', javascript: 'mergeIntervals' },
    starterCode: {
      python: 'def merge_intervals(intervals):\n    pass\n',
      javascript: 'function mergeIntervals(intervals) {\n}\n',
    },
    expectedTime: 'O(n log n)',
    expectedSpace: 'O(n)',
    hints: [
      'Would the problem be easier if the intervals arrived in a particular order?',
      'After sorting by start, an interval can only overlap the most recently merged one.',
    ],
    rubric: 'Sort by start, then sweep. Comparing every pair repeatedly until nothing changes is quadratic or worse.',
    testCases: [
      { input: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { input: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
      { input: [[[1, 4], [0, 4]]], expected: [[0, 4]], hidden: true },
      { input: [[[2, 3], [4, 5], [6, 7], [8, 9], [1, 10]]], expected: [[1, 10]], hidden: true },
      { input: [[[5, 5]]], expected: [[5, 5]], hidden: true },
    ],
  },
  {
    slug: 'design-a-url-shortener',
    title: 'Design a URL Shortener',
    type: 'system-design',
    difficulty: 'medium',
    tags: ['system design', 'storage', 'caching'],
    description: `Design a service like bit.ly that turns long URLs into short links and redirects visitors.

Talk through your design out loud and use the editor as a scratchpad.

Scope to cover
  - Functional and non-functional requirements
  - Capacity estimates (assume 100M new links per month, 100:1 read to write ratio)
  - API design
  - Short code generation strategy and collision handling
  - Data model and storage choice
  - Caching, redirect latency and availability
  - Analytics, expiry, abuse prevention (if time allows)`,
    starterCode: {
      markdown: '# URL shortener design notes\n\n## Requirements\n- \n\n## Capacity estimates\n- \n\n## API\n- \n\n## Data model\n- \n\n## Architecture\n- \n\n## Trade-offs\n- \n',
    },
    expectedTime: 'n/a',
    expectedSpace: 'n/a',
    hints: [
      'Start from the numbers: how many redirects per second, and how much storage over five years?',
      'Compare hashing the URL, a global counter with base 62 encoding, and pre-generated key ranges.',
      'Redirects dominate traffic. What sits between the visitor and the database?',
    ],
    rubric: 'Look for requirement clarification before design, back-of-envelope sizing, a justified ID scheme (base62 counter ranges or KGS vs hash+collision), a read-heavy architecture with cache and CDN, and explicit trade-offs (301 vs 302, consistency, hot keys).',
    testCases: [],
  },
];

/**
 * The full problem set, in three layers (later layers win on the fields they define):
 *   1. the compact catalogue: statement, hints, target complexity, topic and sheet membership
 *   2. auto-verified test suites, whose expected outputs come from reference solutions
 *   3. the hand-written problems above, with full statements and hand-picked tests
 */
export function buildProblems() {
  const { problems, duplicates } = buildCatalogue();
  const bySlug = new Map(problems.map((p) => [p.slug, p]));

  for (const spec of RUNNABLE) {
    const base = bySlug.get(slugify(spec.title));
    if (!base) throw new Error(`Runnable problem "${spec.title}" is missing from the catalogue`);
    const runnable = buildRunnable(spec);
    const fn = runnable.functionName.javascript;
    const examples = runnable.testCases.filter((t) => !t.hidden)
      .map((t) => `  ${fn}(${t.input.map((a) => JSON.stringify(a)).join(', ')})  ->  ${JSON.stringify(t.expected)}`);
    const statement = base.description.split('\n\n')[0];
    Object.assign(base, runnable, { description: `${statement}\n\nExamples\n${examples.join('\n')}` });
  }

  for (const problem of PROBLEMS) {
    const sig = HANDWRITTEN_CPP[problem.slug];
    const cpp = sig && cppFields(sig.fn, sig.types, sig.names);
    const full = cpp
      ? { ...problem, functionName: { ...problem.functionName, cpp: cpp.functionName }, cppSignature: cpp.signature, starterCode: { ...problem.starterCode, cpp: cpp.starter } }
      : problem;
    const base = bySlug.get(full.slug);
    if (!base) bySlug.set(full.slug, { topic: full.type === 'system-design' ? 'System Design' : 'Arrays', order: bySlug.size, ...full });
    // Catalogue metadata (topic, sheet, order) is kept; content comes from the hand-written version.
    else Object.assign(base, full, { tags: [...new Set([...base.tags, ...(full.tags || [])])] });
  }

  return { problems: [...bySlug.values()], duplicates };
}

/** Idempotent bulk upsert so the catalogue is always present and stays in sync with these files. */
export async function seedProblems() {
  const { problems } = buildProblems();
  await Problem.bulkWrite(
    problems.map((p) => ({ updateOne: { filter: { slug: p.slug }, update: { $set: p }, upsert: true } })),
    { ordered: false },
  );
  const withTests = problems.filter((p) => p.testCases.length).length;
  log.info(`Problem catalogue synced (${problems.length} problems, ${withTests} with test suites)`);
}
