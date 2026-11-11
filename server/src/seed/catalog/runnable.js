// Test suites for catalogue problems. Each spec gives a function signature, inputs and a trusted
// reference solution; expected outputs are computed from the reference when the catalogue is built,
// so tests can never drift from the answer key. Inputs after `visible` are hidden from candidates.
const snake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Deterministic pseudo-random numbers so large hidden inputs are identical on every build.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const randomInts = (n, lo, hi, seed) => {
  const next = rng(seed);
  return Array.from({ length: n }, () => lo + Math.floor(next() * (hi - lo + 1)));
};
const range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));

export const RUNNABLE = [
  {
    title: 'Best Time to Buy and Sell Stock', fn: 'maxProfit', params: ['prices'],
    ref: (p) => { let lo = Infinity; let best = 0; for (const x of p) { lo = Math.min(lo, x); best = Math.max(best, x - lo); } return best; },
    tests: [[[7, 1, 5, 3, 6, 4]], [[7, 6, 4, 3, 1]], [[2, 4, 1]], [[5]], [range(15000, (i) => 15000 - i).concat([20000])], [randomInts(15000, 1, 100000, 7)]],
  },
  {
    title: 'Contains Duplicate', fn: 'containsDuplicate', params: ['nums'],
    ref: (a) => new Set(a).size !== a.length,
    tests: [[[1, 2, 3, 1]], [[1, 2, 3, 4]], [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], [[]], [range(15000)], [range(15000).concat([14999])]],
  },
  {
    title: 'Valid Anagram', fn: 'isAnagram', params: ['s', 't'],
    ref: (s, t) => [...s].sort().join('') === [...t].sort().join(''),
    tests: [['anagram', 'nagaram'], ['rat', 'car'], ['a', 'a'], ['ab', 'a'], ['aacc', 'ccac'], ['', '']],
  },
  {
    title: 'Product of Array Except Self', fn: 'productExceptSelf', params: ['nums'],
    ref: (a) => a.map((_, i) => a.reduce((p, x, j) => (i === j ? p : p * x), 1) + 0),
    tests: [[[1, 2, 3, 4]], [[-1, 1, 0, -3, 3]], [[2, 3]], [[0, 0]], [[5, 1, 1, 1, 2]]],
  },
  {
    title: 'Maximum Product Subarray', fn: 'maxProduct', params: ['nums'],
    ref: (a) => { let hi = a[0]; let lo = a[0]; let best = a[0]; for (let i = 1; i < a.length; i += 1) { const c = [a[i], hi * a[i], lo * a[i]]; hi = Math.max(...c); lo = Math.min(...c); best = Math.max(best, hi); } return best; },
    tests: [[[2, 3, -2, 4]], [[-2, 0, -1]], [[-2]], [[-2, 3, -4]], [[0, 2]], [[-1, -2, -3, 0, 1]]],
  },
  {
    title: 'Find Minimum in Rotated Sorted Array', fn: 'findMin', params: ['nums'],
    ref: (a) => Math.min(...a),
    tests: [[[3, 4, 5, 1, 2]], [[4, 5, 6, 7, 0, 1, 2]], [[11, 13, 15, 17]], [[2, 1]], [[1]]],
  },
  {
    title: 'Search in Rotated Sorted Array', fn: 'search', params: ['nums', 'target'],
    ref: (a, t) => a.indexOf(t),
    tests: [[[4, 5, 6, 7, 0, 1, 2], 0], [[4, 5, 6, 7, 0, 1, 2], 3], [[1], 0], [[1, 3], 3], [[5, 1, 3], 5], [[3, 1], 1]],
  },
  {
    title: 'Container With Most Water', fn: 'maxArea', params: ['height'],
    ref: (h) => { let i = 0; let j = h.length - 1; let best = 0; while (i < j) { best = Math.max(best, Math.min(h[i], h[j]) * (j - i)); if (h[i] < h[j]) i += 1; else j -= 1; } return best; },
    tests: [[[1, 8, 6, 2, 5, 4, 8, 3, 7]], [[1, 1]], [[4, 3, 2, 1, 4]], [[1, 2, 1]], [randomInts(12000, 1, 10000, 11)]],
  },
  {
    title: 'Climbing Stairs', fn: 'climbStairs', params: ['n'],
    ref: (n) => { let a = 1; let b = 1; for (let i = 0; i < n; i += 1) [a, b] = [b, a + b]; return a; },
    tests: [[2], [3], [1], [5], [10], [45]],
  },
  {
    title: 'Coin Change', fn: 'coinChange', params: ['coins', 'amount'],
    ref: (coins, amount) => { const dp = Array(amount + 1).fill(Infinity); dp[0] = 0; for (let a = 1; a <= amount; a += 1) for (const c of coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1); return dp[amount] === Infinity ? -1 : dp[amount]; },
    tests: [[[1, 2, 5], 11], [[2], 3], [[1], 0], [[1, 3, 4], 6], [[186, 419, 83, 408], 6249], [[2, 5, 10, 1], 27]],
  },
  {
    title: 'Longest Increasing Subsequence', fn: 'lengthOfLIS', params: ['nums'],
    ref: (a) => { const t = []; for (const x of a) { let lo = 0; let hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; } t[lo] = x; } return t.length; },
    tests: [[[10, 9, 2, 5, 3, 7, 101, 18]], [[0, 1, 0, 3, 2, 3]], [[7, 7, 7, 7]], [[1]], [[4, 10, 4, 3, 8, 9]], [randomInts(2500, 1, 100000, 3)]],
  },
  {
    title: 'House Robber', fn: 'rob', params: ['nums'],
    ref: (a) => { let take = 0; let skip = 0; for (const x of a) [take, skip] = [skip + x, Math.max(take, skip)]; return Math.max(take, skip); },
    tests: [[[1, 2, 3, 1]], [[2, 7, 9, 3, 1]], [[5]], [[2, 1, 1, 2]], [[]], [randomInts(5000, 0, 400, 5)]],
  },
  {
    title: 'Unique Paths', fn: 'uniquePaths', params: ['m', 'n'],
    ref: (m, n) => { const dp = Array(n).fill(1); for (let i = 1; i < m; i += 1) for (let j = 1; j < n; j += 1) dp[j] += dp[j - 1]; return dp[n - 1]; },
    tests: [[3, 7], [3, 2], [1, 1], [7, 3], [10, 10], [16, 16]],
  },
  {
    title: 'Jump Game', fn: 'canJump', params: ['nums'],
    ref: (a) => { let reach = 0; for (let i = 0; i < a.length; i += 1) { if (i > reach) return false; reach = Math.max(reach, i + a[i]); } return true; },
    tests: [[[2, 3, 1, 1, 4]], [[3, 2, 1, 0, 4]], [[0]], [[2, 0, 0]], [[1, 0, 1]], [range(12000, (i) => (i === 11999 ? 0 : 1))]],
  },
  {
    title: 'Number of Islands', fn: 'numIslands', params: ['grid'],
    ref: (grid) => { const g = grid.map((r) => [...r]); let count = 0; const fill = (i, j) => { const stack = [[i, j]]; while (stack.length) { const [r, c] = stack.pop(); if (r < 0 || c < 0 || r >= g.length || c >= g[0].length || g[r][c] !== '1') continue; g[r][c] = '0'; stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]); } }; for (let i = 0; i < g.length; i += 1) for (let j = 0; j < g[0].length; j += 1) if (g[i][j] === '1') { count += 1; fill(i, j); } return count; },
    tests: [
      [[['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']]],
      [[['1', '1', '0', '0', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '1', '0', '0'], ['0', '0', '0', '1', '1']]],
      [[['0']]],
      [[['1', '0', '1', '0', '1']]],
      [range(60, (i) => range(60, (j) => ((i + j) % 2 === 0 ? '1' : '0')))],
    ],
  },
  {
    title: 'Longest Consecutive Sequence', fn: 'longestConsecutive', params: ['nums'],
    ref: (a) => { const s = new Set(a); let best = 0; for (const x of s) if (!s.has(x - 1)) { let y = x; while (s.has(y + 1)) y += 1; best = Math.max(best, y - x + 1); } return best; },
    tests: [[[100, 4, 200, 1, 3, 2]], [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], [[]], [[1, 2, 0, 1]], [[9]], [randomInts(20000, -50000, 50000, 13)]],
  },
  {
    title: 'Missing Number', fn: 'missingNumber', params: ['nums'],
    ref: (a) => (a.length * (a.length + 1)) / 2 - a.reduce((x, y) => x + y, 0),
    tests: [[[3, 0, 1]], [[0, 1]], [[9, 6, 4, 2, 3, 5, 7, 0, 1]], [[0]], [[1]]],
  },
  {
    title: 'Single Number', fn: 'singleNumber', params: ['nums'],
    ref: (a) => a.reduce((x, y) => x ^ y, 0),
    tests: [[[2, 2, 1]], [[4, 1, 2, 1, 2]], [[1]], [[-3, 7, 7]], [[0, 5, 0]]],
  },
  {
    title: 'Majority Element', fn: 'majorityElement', params: ['nums'],
    ref: (a) => { let c = 0; let v = null; for (const x of a) { if (c === 0) v = x; c += x === v ? 1 : -1; } return v; },
    tests: [[[3, 2, 3]], [[2, 2, 1, 1, 1, 2, 2]], [[1]], [[6, 5, 5]], [[-1, -1, 2]]],
  },
  {
    title: 'Binary Search', fn: 'search', params: ['nums', 'target'],
    ref: (a, t) => a.indexOf(t),
    tests: [[[-1, 0, 3, 5, 9, 12], 9], [[-1, 0, 3, 5, 9, 12], 2], [[5], 5], [[], 1], [[1, 3], 3], [range(20000, (i) => i * 2), 39998]],
  },
  {
    title: 'Trapping Rain Water', fn: 'trap', params: ['height'],
    ref: (h) => { let l = 0; let r = h.length - 1; let lm = 0; let rm = 0; let w = 0; while (l < r) { if (h[l] < h[r]) { lm = Math.max(lm, h[l]); w += lm - h[l]; l += 1; } else { rm = Math.max(rm, h[r]); w += rm - h[r]; r -= 1; } } return w; },
    tests: [[[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], [[4, 2, 0, 3, 2, 5]], [[]], [[3, 3, 3]], [[5, 0, 5]], [randomInts(15000, 0, 1000, 17)]],
  },
  {
    title: 'Longest Common Subsequence', fn: 'longestCommonSubsequence', params: ['text1', 'text2'],
    ref: (a, b) => { let prev = Array(b.length + 1).fill(0); for (let i = 1; i <= a.length; i += 1) { const cur = [0]; for (let j = 1; j <= b.length; j += 1) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; } return prev[b.length]; },
    tests: [['abcde', 'ace'], ['abc', 'abc'], ['abc', 'def'], ['bsbininm', 'jmjkbkjkv'], ['', 'a'], ['abcba', 'abcbcba']],
  },
  {
    title: 'Edit Distance', fn: 'minDistance', params: ['word1', 'word2'],
    ref: (a, b) => { let prev = range(b.length + 1); for (let i = 1; i <= a.length; i += 1) { const cur = [i]; for (let j = 1; j <= b.length; j += 1) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]); prev = cur; } return prev[b.length]; },
    tests: [['horse', 'ros'], ['intention', 'execution'], ['', ''], ['a', ''], ['abc', 'abc'], ['sunday', 'saturday']],
  },
  {
    title: 'Kth Largest Element in an Array', fn: 'findKthLargest', params: ['nums', 'k'],
    ref: (a, k) => [...a].sort((x, y) => y - x)[k - 1],
    tests: [[[3, 2, 1, 5, 6, 4], 2], [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], [[1], 1], [[2, 1], 2], [[7, 7, 7], 2], [randomInts(20000, -10000, 10000, 19), 500]],
  },
  {
    title: 'Top K Frequent Elements', fn: 'topKFrequent', params: ['nums', 'k'], compare: 'sorted',
    ref: (a, k) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map((e) => e[0]); },
    tests: [[[1, 1, 1, 2, 2, 3], 2], [[1], 1], [[4, 4, 4, 6, 6, 7, 7, 7, 7], 1], [[5, 5, 9, 9, 9, 1], 2], [[-1, -1, 2, 2, 2, 3], 2]],
  },
  {
    title: 'Valid Palindrome', fn: 'isPalindrome', params: ['s'],
    ref: (s) => { const t = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return t === [...t].reverse().join(''); },
    tests: [['A man, a plan, a canal: Panama'], ['race a car'], [' '], ['0P'], ['ab_a'], ['No lemon, no melon']],
  },
  {
    title: 'Subarray Sum Equals K', fn: 'subarraySum', params: ['nums', 'k'],
    ref: (a, k) => { const m = new Map([[0, 1]]); let s = 0; let c = 0; for (const x of a) { s += x; c += m.get(s - k) || 0; m.set(s, (m.get(s) || 0) + 1); } return c; },
    tests: [[[1, 1, 1], 2], [[1, 2, 3], 3], [[1, -1, 0], 0], [[3], 3], [[0, 0, 0], 0], [randomInts(12000, -50, 50, 23), 25]],
  },
  {
    title: 'Largest Rectangle in Histogram', fn: 'largestRectangleArea', params: ['heights'],
    ref: (h) => { const st = []; let best = 0; for (let i = 0; i <= h.length; i += 1) { const cur = i === h.length ? 0 : h[i]; while (st.length && h[st[st.length - 1]] >= cur) { const height = h[st.pop()]; const left = st.length ? st[st.length - 1] : -1; best = Math.max(best, height * (i - left - 1)); } st.push(i); } return best; },
    tests: [[[2, 1, 5, 6, 2, 3]], [[2, 4]], [[1]], [[6, 2, 5, 4, 5, 1, 6]], [[3, 3, 3, 3]], [range(15000, (i) => i + 1)]],
  },
  {
    title: 'Daily Temperatures', fn: 'dailyTemperatures', params: ['temperatures'],
    ref: (t) => { const out = Array(t.length).fill(0); const st = []; for (let i = 0; i < t.length; i += 1) { while (st.length && t[st[st.length - 1]] < t[i]) { const j = st.pop(); out[j] = i - j; } st.push(i); } return out; },
    tests: [[[73, 74, 75, 71, 69, 72, 76, 73]], [[30, 40, 50, 60]], [[30, 60, 90]], [[90, 80, 70]], [[50]], [range(8000, (i) => 8000 - i).concat([20000])]],
  },
  {
    title: 'Minimum Path Sum', fn: 'minPathSum', params: ['grid'],
    ref: (g) => { const dp = g.map((r) => [...r]); for (let i = 0; i < dp.length; i += 1) for (let j = 0; j < dp[0].length; j += 1) { if (i === 0 && j === 0) continue; dp[i][j] += Math.min(i ? dp[i - 1][j] : Infinity, j ? dp[i][j - 1] : Infinity); } return dp[dp.length - 1][dp[0].length - 1]; },
    tests: [[[[1, 3, 1], [1, 5, 1], [4, 2, 1]]], [[[1, 2, 3], [4, 5, 6]]], [[[7]]], [[[1, 2], [1, 1]]], [[[5, 1, 9, 1], [1, 9, 1, 1]]]],
  },
  {
    title: 'Word Break', fn: 'wordBreak', params: ['s', 'wordDict'],
    ref: (s, words) => { const set = new Set(words); const dp = [true]; for (let i = 1; i <= s.length; i += 1) dp[i] = range(i).some((j) => dp[j] && set.has(s.slice(j, i))); return dp[s.length]; },
    tests: [['leetcode', ['leet', 'code']], ['applepenapple', ['apple', 'pen']], ['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']], ['a', ['b']], ['aaaaaaa', ['aaaa', 'aaa']], [`${'a'.repeat(150)}b`, ['a', 'aa', 'aaa', 'aaaa', 'aaaaa']]],
  },
  {
    title: 'Decode Ways', fn: 'numDecodings', params: ['s'],
    ref: (s) => { let a = 1; let b = s[0] === '0' ? 0 : 1; for (let i = 1; i < s.length; i += 1) { let c = 0; if (s[i] !== '0') c += b; const two = Number(s.slice(i - 1, i + 1)); if (two >= 10 && two <= 26) c += a; [a, b] = [b, c]; } return b; },
    tests: [['12'], ['226'], ['06'], ['10'], ['27'], ['1111111111']],
  },
  {
    title: 'Sqrt(x)', fn: 'mySqrt', params: ['x'],
    ref: (x) => Math.floor(Math.sqrt(x)),
    tests: [[4], [8], [0], [1], [2147395599], [99]],
  },
  {
    title: 'Spiral Matrix', fn: 'spiralOrder', params: ['matrix'],
    ref: (m) => { const out = []; let t = 0; let b = m.length - 1; let l = 0; let r = m[0].length - 1; while (t <= b && l <= r) { for (let j = l; j <= r; j += 1) out.push(m[t][j]); t += 1; for (let i = t; i <= b; i += 1) out.push(m[i][r]); r -= 1; if (t <= b) { for (let j = r; j >= l; j -= 1) out.push(m[b][j]); b -= 1; } if (l <= r) { for (let i = b; i >= t; i -= 1) out.push(m[i][l]); l += 1; } } return out; },
    tests: [[[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], [[[1]]], [[[1, 2], [3, 4], [5, 6]]], [[[1, 2, 3]]], [[[1], [2], [3]]]],
  },
  {
    title: 'Koko Eating Bananas', fn: 'minEatingSpeed', params: ['piles', 'h'],
    ref: (piles, h) => { let lo = 1; let hi = Math.max(...piles); while (lo < hi) { const m = (lo + hi) >> 1; if (piles.reduce((s, p) => s + Math.ceil(p / m), 0) <= h) hi = m; else lo = m + 1; } return lo; },
    tests: [[[3, 6, 7, 11], 8], [[30, 11, 23, 4, 20], 5], [[30, 11, 23, 4, 20], 6], [[1], 1], [[312884470], 968709470], [randomInts(8000, 1, 1000000, 29), 20000]],
  },
  {
    title: 'Longest Repeating Character Replacement', fn: 'characterReplacement', params: ['s', 'k'],
    ref: (s, k) => { const c = {}; let l = 0; let hi = 0; let best = 0; for (let r = 0; r < s.length; r += 1) { c[s[r]] = (c[s[r]] || 0) + 1; hi = Math.max(hi, c[s[r]]); while (r - l + 1 - hi > k) { c[s[l]] -= 1; l += 1; } best = Math.max(best, r - l + 1); } return best; },
    tests: [['ABAB', 2], ['AABABBA', 1], ['A', 0], ['ABCDE', 1], ['AAAA', 2], ['BAAAB', 2]],
  },
  {
    title: 'N-Queens II', fn: 'totalNQueens', params: ['n'],
    ref: (n) => { let count = 0; const go = (row, cols, d1, d2) => { if (row === n) { count += 1; return; } for (let c = 0; c < n; c += 1) { const a = 1 << c; const b = 1 << (row + c); const d = 1 << (row - c + n); if (cols & a || d1 & b || d2 & d) continue; go(row + 1, cols | a, d1 | b, d2 | d); } }; go(0, 0, 0, 0); return count; },
    tests: [[4], [1], [2], [5], [6], [8]],
  },
];

// C++ signatures: [return type, ...parameter types], in the same order as `params`.
const V = 'vector<int>&';
const S = 'string';
const CPP = {
  'Best Time to Buy and Sell Stock': ['int', V],
  'Contains Duplicate': ['bool', V],
  'Valid Anagram': ['bool', S, S],
  'Product of Array Except Self': ['vector<int>', V],
  'Maximum Product Subarray': ['int', V],
  'Find Minimum in Rotated Sorted Array': ['int', V],
  'Search in Rotated Sorted Array': ['int', V, 'int'],
  'Container With Most Water': ['int', V],
  'Climbing Stairs': ['int', 'int'],
  'Coin Change': ['int', V, 'int'],
  'Longest Increasing Subsequence': ['int', V],
  'House Robber': ['int', V],
  'Unique Paths': ['int', 'int', 'int'],
  'Jump Game': ['bool', V],
  'Number of Islands': ['int', 'vector<vector<char>>&'],
  'Longest Consecutive Sequence': ['int', V],
  'Missing Number': ['int', V],
  'Single Number': ['int', V],
  'Majority Element': ['int', V],
  'Binary Search': ['int', V, 'int'],
  'Trapping Rain Water': ['int', V],
  'Longest Common Subsequence': ['int', S, S],
  'Edit Distance': ['int', S, S],
  'Kth Largest Element in an Array': ['int', V, 'int'],
  'Top K Frequent Elements': ['vector<int>', V, 'int'],
  'Valid Palindrome': ['bool', S],
  'Subarray Sum Equals K': ['int', V, 'int'],
  'Largest Rectangle in Histogram': ['int', V],
  'Daily Temperatures': ['vector<int>', V],
  'Minimum Path Sum': ['int', 'vector<vector<int>>&'],
  'Word Break': ['bool', S, 'vector<string>&'],
  'Decode Ways': ['int', S],
  'Sqrt(x)': ['int', 'int'],
  'Spiral Matrix': ['vector<int>', 'vector<vector<int>>&'],
  'Koko Eating Bananas': ['int', V, 'int'],
  'Longest Repeating Character Replacement': ['int', S, 'int'],
  'N-Queens II': ['int', 'int'],
};

/** C++ fields for a function: name, typed signature and starter code. */
export function cppFields(fn, [ret, ...types], names) {
  const params = types.map((type, i) => `${type} ${names[i]}`).join(', ');
  return {
    functionName: fn,
    signature: { ret, params: types },
    starter: `#include <bits/stdc++.h>\nusing namespace std;\n\n${ret} ${fn}(${params}) {\n    \n}\n`,
  };
}

/** Turn a spec into the Problem fields that make it runnable against tests. */
export function buildRunnable(spec) {
  const visible = spec.visible ?? 3;
  const python = snake(spec.fn);
  const args = spec.params.join(', ');
  if (!CPP[spec.title]) throw new Error(`Runnable problem "${spec.title}" has no C++ signature`);
  const cpp = cppFields(spec.fn, CPP[spec.title], spec.params);
  return {
    functionName: { python, javascript: spec.fn, cpp: cpp.functionName },
    cppSignature: cpp.signature,
    starterCode: {
      python: `def ${python}(${spec.params.map(snake).join(', ')}):\n    pass\n`,
      javascript: `function ${spec.fn}(${args}) {\n}\n`,
      cpp: cpp.starter,
    },
    compare: spec.compare || 'exact',
    testCases: spec.tests.map((input, i) => ({
      input,
      expected: spec.ref(...structuredClone(input)),
      hidden: i >= visible,
    })),
  };
}
