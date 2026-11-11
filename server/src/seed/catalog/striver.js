// The problems of Striver's SDE Sheet, grouped by the sheet's days.
// Format: Title | E/M/H | statement | hint ;; hint | target time | target space
const sheet = 'striver-sde';

export const STRIVER_SDE = [
  { sheet, section: 'Day 1: Arrays', topic: 'Arrays', items: `
Set Matrix Zeroes | M | Given an m x n matrix, if any cell is 0, set its entire row and column to 0, in place. | Record which rows and columns need zeroing before you change anything. ;; The first row and first column can serve as the markers, with one extra flag for the overlap. | O(m*n) | O(1)
Pascal's Triangle | E | Return the first n rows of Pascal's triangle. | Each inner value is the sum of the two values above it. ;; A single row can also be built left to right by multiplying by (row - col) / col. | O(n^2)
Next Permutation | M | Rearrange an array of numbers in place into the next lexicographically greater permutation, wrapping to the smallest if none exists. | Scan from the right for the first index whose value is smaller than its right neighbour. ;; Swap it with the smallest larger value to its right, then reverse the suffix. | O(n) | O(1)
Maximum Subarray | M | Find the contiguous subarray with the largest sum and return that sum. | The best subarray ending here either extends the previous one or starts fresh. ;; Reset the running sum whenever it drops below zero. | O(n) | O(1)
Sort Colors | M | Sort an array containing only 0s, 1s and 2s in place, in one pass. | Counting works in two passes; can you do it in one? ;; Keep three pointers: low, mid and high, and swap based on the value at mid. | O(n) | O(1)
Best Time to Buy and Sell Stock | E | Given daily prices, return the maximum profit from buying once and selling once on a later day. | For each day, what is the cheapest price seen before it? ;; Track the running minimum and the best difference in one pass. | O(n) | O(1)
` },
  { sheet, section: 'Day 2: Arrays II', topic: 'Arrays', items: `
Rotate Image | M | Rotate an n x n matrix by 90 degrees clockwise, in place. | A rotation can be composed from two simpler reflections. ;; Transpose the matrix, then reverse every row. | O(n^2) | O(1)
Merge Intervals | M | Merge all overlapping intervals and return the non-overlapping result. | Would a particular ordering make overlaps adjacent? ;; Sort by start, then compare each interval with the last merged one. | O(n log n)
Merge Sorted Array | E | Merge two sorted arrays into the first one, which has enough trailing space, without extra memory. | Filling from the front overwrites values you still need. ;; Fill from the back using three pointers. | O(m+n) | O(1)
Find the Duplicate Number | M | An array of n+1 integers in the range 1..n contains one repeated number. Find it without modifying the array and with constant extra space. | Treat each value as a pointer to the next index. ;; That forms a linked list with a cycle: use slow and fast pointers. | O(n) | O(1)
Repeat and Missing Number | M | An array of size n holds numbers from 1..n where one number appears twice and one is missing. Find both. | Two unknowns need two equations: think sums and sums of squares. ;; Alternatively XOR everything and split by a set bit. | O(n) | O(1)
Count Inversions | H | Count pairs (i, j) with i < j and a[i] > a[j]. | A sorted half lets you count many inversions at once. ;; Count during the merge step of merge sort. | O(n log n)
` },
  { sheet, section: 'Day 3: Arrays III', topic: 'Arrays', items: `
Search a 2D Matrix | M | Each row of a matrix is sorted and each row starts after the previous row ends. Decide whether a target exists. | The matrix is one sorted list in disguise. ;; Binary search over indices 0..m*n-1 and map each to a row and column. | O(log(m*n)) | O(1)
Pow(x, n) | M | Compute x raised to an integer power n, where n may be negative. | Multiplying n times is too slow. ;; Square the base and halve the exponent; handle negative n by inverting. | O(log n)
Majority Element | E | Find the element that appears more than n/2 times. | Pair off different elements and see what survives. ;; Boyer-Moore voting keeps one candidate and a counter. | O(n) | O(1)
Majority Element II | M | Find all elements appearing more than n/3 times. | At most two such elements can exist. ;; Extend the voting algorithm to two candidates, then verify the counts. | O(n) | O(1)
Unique Paths | M | Count the paths from the top-left to the bottom-right of an m x n grid moving only right or down. | The number of ways to reach a cell depends on the cell above and the cell to the left. ;; It is also a single binomial coefficient. | O(m*n)
Reverse Pairs | H | Count pairs (i, j) with i < j and a[i] > 2 * a[j]. | It resembles counting inversions. ;; Count across the two sorted halves before merging them. | O(n log n)
` },
  { sheet, section: 'Day 4: Arrays IV', topic: 'Hashing', items: `
Two Sum | E | Return the indices of the two numbers in an array that add up to a target. | For each number, what other value are you looking for? ;; Store values with their indices in a hash map as you scan. | O(n)
4Sum | M | Find all unique quadruplets that sum to a target. | Fixing two numbers reduces it to a familiar problem. ;; Sort, fix two indices, then use two pointers and skip duplicates. | O(n^3)
Longest Consecutive Sequence | M | Find the length of the longest run of consecutive integers in an unsorted array. | Sorting works but is not the target. ;; Put everything in a set and only start counting from numbers with no predecessor. | O(n)
Largest Subarray with Zero Sum | M | Find the length of the longest subarray whose elements sum to zero. | Two equal prefix sums bracket a zero-sum subarray. ;; Store the first index of each prefix sum in a hash map. | O(n)
Count Subarrays with Given XOR | M | Count the subarrays whose XOR equals k. | Prefix XOR behaves like prefix sum. ;; For each prefix value p, count earlier prefixes equal to p XOR k. | O(n)
Longest Substring Without Repeating Characters | M | Return the length of the longest substring with no repeated characters. | Maintain a window that never contains a duplicate. ;; Remember each character's last index so the left edge can jump. | O(n)
` },
  { sheet, section: 'Day 5: Linked List', topic: 'Linked List', items: `
Reverse Linked List | E | Reverse a singly linked list. | Walk the list while flipping each next pointer. ;; Keep three references: previous, current and next. | O(n) | O(1)
Middle of the Linked List | E | Return the middle node of a linked list; for even length return the second middle. | Counting needs two passes. ;; Move one pointer twice as fast as the other. | O(n) | O(1)
Merge Two Sorted Lists | E | Merge two sorted linked lists into one sorted list. | A dummy head node removes special cases. ;; Repeatedly attach the smaller head and advance it. | O(m+n) | O(1)
Remove Nth Node From End of List | M | Remove the n-th node from the end of a linked list in one pass. | Keep two pointers a fixed distance apart. ;; Advance the lead pointer n steps first, then move both. | O(n) | O(1)
Add Two Numbers | M | Two numbers are stored as linked lists of digits in reverse order. Return their sum as a list. | Simulate column addition. ;; Carry on while either list has nodes or a carry remains. | O(max(m,n))
Delete Node in a Linked List | M | Delete a node from a singly linked list when you are given only that node, not the head. | You cannot reach the previous node. ;; Copy the next node's value here and unlink the next node instead. | O(1) | O(1)
` },
  { sheet, section: 'Day 6: Linked List II', topic: 'Linked List', items: `
Intersection of Two Linked Lists | E | Return the node where two singly linked lists merge, or null. | The difference in lengths is the only obstacle. ;; Let each pointer switch to the other list's head when it reaches the end. | O(m+n) | O(1)
Linked List Cycle | E | Decide whether a linked list contains a cycle. | A hash set works but uses memory. ;; A fast pointer will eventually lap a slow one inside a cycle. | O(n) | O(1)
Reverse Nodes in k-Group | H | Reverse the nodes of a linked list k at a time; leave a shorter final group unchanged. | First check that k nodes remain. ;; Reverse one group, then reconnect its tail to the result for the rest. | O(n) | O(1)
Palindrome Linked List | E | Decide whether a singly linked list reads the same forwards and backwards. | You only need to compare the two halves. ;; Find the middle, reverse the second half, then compare. | O(n) | O(1)
Linked List Cycle II | M | Return the node where a cycle begins, or null if there is none. | First detect the meeting point with slow and fast pointers. ;; Restart one pointer from the head; they meet at the cycle start. | O(n) | O(1)
Flattening a Linked List | M | Each node has a next pointer and a bottom pointer to a sorted sub-list. Flatten everything into one sorted list using bottom pointers. | You already know how to merge two sorted lists. ;; Merge from the last column backwards. | O(total nodes * lists)
` },
  { sheet, section: 'Day 7: Linked List and Arrays', topic: 'Two Pointers', items: `
Rotate List | M | Rotate a linked list to the right by k places. | k can exceed the length. ;; Join the tail to the head to make a ring, then cut at length - k mod length. | O(n) | O(1)
Copy List with Random Pointer | M | Deep copy a linked list whose nodes have an extra pointer to any node. | A map from original to copy handles the random pointers. ;; For constant space, interleave copies with originals and then split. | O(n)
3Sum | M | Find all unique triplets that sum to zero. | Fix one number and the rest is a two-number problem. ;; Sort, then use two pointers and skip repeated values. | O(n^2)
Trapping Rain Water | H | Given bar heights, compute how much water is trapped after rain. | Water above a bar depends on the tallest bars to its left and right. ;; Two pointers moving inward can track both maxima in constant space. | O(n) | O(1)
Remove Duplicates from Sorted Array | E | Remove duplicates from a sorted array in place and return the new length. | Duplicates are adjacent. ;; Keep a write index that advances only for new values. | O(n) | O(1)
Max Consecutive Ones | E | Return the longest run of consecutive 1s in a binary array. | Count as you go. ;; Reset the counter at each 0 and track the maximum. | O(n) | O(1)
` },
  { sheet, section: 'Day 8: Greedy', topic: 'Greedy', items: `
N Meetings in One Room | E | Given start and end times, find the maximum number of meetings one room can host. | Which meeting should you pick first to leave the most room? ;; Sort by end time and take every meeting that starts after the last one ended. | O(n log n)
Minimum Number of Platforms | M | Given train arrival and departure times, find the minimum number of platforms needed so no train waits. | Only the order of events matters. ;; Sort arrivals and departures separately and sweep with two pointers. | O(n log n)
Job Sequencing Problem | M | Each job takes one unit of time and has a deadline and a profit. Maximise total profit. | Prefer high-profit jobs. ;; Sort by profit and place each job in the latest free slot before its deadline. | O(n log n)
Fractional Knapsack | M | Items have values and weights and may be split. Maximise value within a capacity. | What makes one item better than another per unit of capacity? ;; Sort by value-to-weight ratio and take greedily. | O(n log n)
Minimum Coins with Canonical Denominations | E | Using standard currency denominations, find the minimum number of coins and notes for an amount. | Largest first works for canonical systems. ;; Explain why this greedy fails for arbitrary denominations. | O(amount / smallest)
Assign Cookies | E | Each child has a greed factor and each cookie a size. Maximise the number of content children. | Do not waste big cookies on easily pleased children. ;; Sort both arrays and match with two pointers. | O(n log n)
` },
  { sheet, section: 'Day 9: Recursion', topic: 'Backtracking', items: `
Subset Sums | M | Return the sums of all subsets of an array, in sorted order. | Every element is either included or not. ;; Recurse with a running sum and two branches per index. | O(2^n)
Subsets II | M | Return all distinct subsets of an array that may contain duplicates. | Sorting groups equal values together. ;; At each depth, skip a value equal to the previous one at the same level. | O(2^n * n)
Combination Sum | M | Find all unique combinations of candidates that sum to a target; each candidate may be reused. | Stay on the same index to reuse a number. ;; Stop a branch once the remaining target goes negative. | O(2^t)
Combination Sum II | M | Find all unique combinations summing to a target where each number is used at most once. | Sort first. ;; Skip equal neighbours at the same recursion level to avoid duplicate combinations. | O(2^n)
Palindrome Partitioning | M | Return every way to split a string so that each piece is a palindrome. | Try every prefix that is a palindrome. ;; Recurse on the remainder and backtrack. | O(n * 2^n)
Permutation Sequence | H | Return the k-th permutation of the numbers 1..n in lexicographic order. | Each leading digit owns (n-1)! permutations. ;; Divide k by factorials to choose each digit in turn. | O(n^2)
` },
  { sheet, section: 'Day 10: Backtracking', topic: 'Backtracking', items: `
Permutations | M | Return all permutations of a list of distinct integers. | Build the permutation one position at a time. ;; Use a used-set, or swap elements in place and recurse. | O(n * n!)
N-Queens | H | Place n queens on an n x n board so none attack each other; return all arrangements. | Place one queen per row. ;; Track occupied columns and both diagonal directions in sets. | O(n!)
Sudoku Solver | H | Fill a partially completed 9 x 9 Sudoku grid. | Try digits in an empty cell and undo on failure. ;; Keep row, column and box usage for constant-time validity checks. | exponential
M-Coloring Problem | M | Decide whether a graph can be coloured with at most m colours so adjacent nodes differ. | Colour nodes one at a time. ;; Before assigning a colour, check all neighbours; backtrack if none fits. | O(m^n)
Rat in a Maze | M | Find all paths from the top-left to the bottom-right of a grid with blocked cells, moving in four directions without revisiting. | Depth-first search with a visited mark. ;; Unmark the cell when you return so other paths can use it. | O(4^(n*n))
Word Break II | H | Return every sentence that can be formed by splitting a string into dictionary words. | Try each dictionary word that is a prefix. ;; Memoise the list of sentences for each start index. | exponential
` },
  { sheet, section: 'Day 11: Binary Search', topic: 'Binary Search', items: `
Nth Root of a Number | M | Find the integer n-th root of m, or report that it is not an integer. | The answer lies between 1 and m. ;; Binary search on the candidate and compare its n-th power with m, guarding against overflow. | O(n log m)
Matrix Median | H | Each row of a matrix is sorted. Find the median of all elements without flattening. | Search on the value, not on a position. ;; For a guess, count elements not larger than it using binary search in each row. | O(32 * r log c)
Single Element in a Sorted Array | M | Every element of a sorted array appears twice except one. Find it. | Before the single element, pairs start at even indices. ;; Binary search on that parity pattern. | O(log n) | O(1)
Search in Rotated Sorted Array | M | Search for a target in a sorted array that has been rotated at an unknown pivot. | One half around the midpoint is always sorted. ;; Decide whether the target lies inside the sorted half. | O(log n) | O(1)
Median of Two Sorted Arrays | H | Find the median of two sorted arrays. | Merging is linear; the target is logarithmic. ;; Binary search a partition of the smaller array so the left parts hold half of all elements. | O(log(min(m,n))) | O(1)
K-th Element of Two Sorted Arrays | M | Find the k-th smallest element in the union of two sorted arrays. | It generalises the median partition idea. ;; Binary search how many elements to take from the smaller array. | O(log(min(m,n)))
Allocate Minimum Number of Pages | H | Assign contiguous books to m students so that the maximum pages given to one student is minimised. | If a maximum is feasible, any larger maximum is too. ;; Binary search the answer and greedily count the students needed. | O(n log(sum))
Aggressive Cows | H | Place c cows in stalls at given positions so that the minimum distance between any two is maximised. | Guess the distance and check whether it is achievable. ;; Sort the stalls, binary search the distance, place cows greedily. | O(n log(range))
` },
  { sheet, section: 'Day 12: Heaps', topic: 'Heap', items: `
Implement a Min Heap | M | Implement a binary min heap supporting insert, peek and extract-min. | Store the tree in an array. ;; Insert sifts up; extraction moves the last item to the root and sifts down. | O(log n) per operation
Kth Largest Element in an Array | M | Return the k-th largest element of an unsorted array. | Sorting is more work than needed. ;; A min heap of size k, or quickselect for average linear time. | O(n) average
Maximum Sum Combinations | M | Given two arrays, return the k largest sums formed by picking one element from each. | Sort both arrays descending. ;; Use a max heap of index pairs and a visited set. | O(n log n)
Find Median from Data Stream | H | Design a structure that accepts numbers one at a time and returns the median so far. | Keep the lower half and upper half separately. ;; A max heap and a min heap whose sizes differ by at most one. | O(log n) per add
Merge k Sorted Lists | H | Merge k sorted linked lists into one sorted list. | You always need the smallest current head. ;; A min heap of heads, or divide and conquer pairwise merging. | O(N log k)
Top K Frequent Elements | M | Return the k most frequent elements of an array. | Count first. ;; Bucket the values by frequency to avoid a full sort. | O(n)
` },
  { sheet, section: 'Day 13: Stack and Queue', topic: 'Stack', items: `
Implement Stack using Array | E | Implement push, pop, top and size for a stack backed by an array. | Track the index of the top element. ;; Decide how you handle overflow and underflow. | O(1) per operation
Implement Queue using Array | E | Implement a fixed-capacity queue backed by an array. | Naive dequeue shifts every element. ;; Use a circular buffer with front index and count. | O(1) per operation
Implement Stack using Queues | E | Implement a stack using only queue operations. | One queue is enough. ;; After each push, rotate the queue so the new element is at the front. | O(n) push
Implement Queue using Stacks | E | Implement a queue using only stack operations. | Use one stack for input and one for output. ;; Only move elements across when the output stack is empty. | O(1) amortised
Valid Parentheses | E | Decide whether a string of brackets is correctly matched and nested. | A closing bracket must match the most recent unmatched opener. ;; Use a stack of openers. | O(n)
Next Greater Element | M | For each element, find the next element to its right that is larger, or -1. | Elements waiting for an answer form a decreasing sequence. ;; Maintain a monotonic stack. | O(n)
Sort a Stack | M | Sort a stack using only stack operations and recursion. | Pop everything recursively. ;; On the way back, insert each value into its sorted position recursively. | O(n^2)
` },
  { sheet, section: 'Day 14: Stack and Queue II', topic: 'Stack', items: `
Next Smaller Element | M | For each element, find the nearest smaller element to its left, or -1. | Mirror image of next greater element. ;; Keep an increasing monotonic stack. | O(n)
LRU Cache | M | Design a cache with get and put in constant time that evicts the least recently used key at capacity. | You need fast lookup and fast reordering. ;; Combine a hash map with a doubly linked list. | O(1) per operation
LFU Cache | H | Design a cache that evicts the least frequently used key, breaking ties by least recent use, with constant-time operations. | Group keys by their use count. ;; Keep a map from frequency to a linked list of keys, plus the current minimum frequency. | O(1) per operation
Largest Rectangle in Histogram | H | Find the area of the largest rectangle that fits under a histogram. | Each bar extends until a shorter bar on each side. ;; A monotonic stack finds both boundaries in one pass. | O(n)
Sliding Window Maximum | H | Return the maximum of every window of size k. | A value smaller than a newer value can never be a maximum again. ;; Keep a deque of indices with decreasing values. | O(n)
Min Stack | M | Design a stack that also returns its minimum in constant time. | The minimum changes only on push and pop. ;; Store the running minimum alongside each element. | O(1) per operation
Rotting Oranges | M | In a grid, rotten oranges spoil adjacent fresh ones each minute. Return the minutes until none are fresh, or -1. | All rotten oranges spread at the same time. ;; Multi-source breadth-first search. | O(m*n)
Online Stock Span | M | For each day's price, return how many consecutive days up to today had a price no higher. | Earlier lower prices are absorbed by today's. ;; Monotonic stack storing price and accumulated span. | O(1) amortised
Maximum of Minimums for Every Window Size | H | For every window size from 1 to n, find the maximum among the minimums of all windows of that size. | For each element, find the largest window in which it is the minimum. ;; Use previous and next smaller elements, then fill answers from large to small sizes. | O(n)
The Celebrity Problem | M | Among n people, find the one known by everyone who knows nobody, using a knows(a, b) query. | One query eliminates one person. ;; Narrow to a single candidate with two pointers, then verify. | O(n)
` },
  { sheet, section: 'Day 15: String', topic: 'Strings', items: `
Reverse Words in a String | M | Reverse the order of words in a string, collapsing extra spaces. | Splitting is the easy way. ;; In place: reverse the whole string, then reverse each word. | O(n)
Longest Palindromic Substring | M | Return the longest palindromic substring of a string. | A palindrome mirrors around a centre. ;; Expand around each of the 2n-1 centres. | O(n^2)
Roman to Integer | E | Convert a Roman numeral to an integer. | A smaller symbol before a larger one is subtracted. ;; Scan right to left comparing with the previous value. | O(n)
Integer to Roman | M | Convert an integer to a Roman numeral. | Include the subtractive forms as symbols. ;; Greedily subtract the largest value that fits. | O(1)
String to Integer (atoi) | M | Parse an integer from a string with optional whitespace and sign, clamping to 32-bit range. | Handle whitespace, sign, digits and stop conditions in order. ;; Check for overflow before each multiplication. | O(n)
Find the Index of the First Occurrence in a String | E | Return the index of the first occurrence of a needle in a haystack, or -1. | The naive scan is O(n*m). ;; KMP or a rolling hash makes it linear. | O(n+m)
Longest Common Prefix | E | Find the longest prefix shared by all strings in a list. | Compare column by column. ;; Alternatively sort and compare only the first and last strings. | O(total characters)
Repeated String Match | M | Find the minimum number of times string a must be repeated so that b is a substring of it. | b can only start within the first copy of a. ;; Repeat until the length covers b, then try one more copy. | O(n+m)
` },
  { sheet, section: 'Day 16: String II', topic: 'Strings', items: `
Z Algorithm | M | Compute the Z-array of a string, where z[i] is the length of the longest substring starting at i that matches a prefix. | Reuse previously matched information. ;; Maintain the rightmost matched segment [l, r]. | O(n)
KMP Prefix Function | M | Compute, for every prefix of a string, the length of its longest proper prefix that is also a suffix. | Extend the previous border when the next characters match. ;; Otherwise fall back through shorter borders. | O(n)
Minimum Characters to Add at Front to Make a Palindrome | H | Find the fewest characters to prepend so that a string becomes a palindrome. | Find the longest palindromic prefix. ;; Run the prefix function on s + separator + reversed s. | O(n)
Valid Anagram | E | Decide whether two strings are anagrams of each other. | Anagrams share the same character counts. ;; A 26-entry counter beats sorting. | O(n)
Count and Say | M | Return the n-th term of the sequence where each term describes the runs of digits in the previous term. | Generate each term from the one before it. ;; Run-length encode with two pointers. | O(n * length)
Compare Version Numbers | M | Compare two dotted version strings, treating missing revisions as 0. | Compare revision by revision as integers. ;; Parse both strings with two pointers to avoid splitting. | O(n+m)
` },
  { sheet, section: 'Day 17: Binary Tree', topic: 'Trees', items: `
Binary Tree Inorder Traversal | E | Return the inorder traversal of a binary tree, iteratively. | Simulate recursion with a stack. ;; Push left children until none remain, visit, then go right. | O(n)
Binary Tree Preorder Traversal | E | Return the preorder traversal of a binary tree, iteratively. | Visit a node before its children. ;; Push the right child before the left so the left pops first. | O(n)
Binary Tree Postorder Traversal | E | Return the postorder traversal of a binary tree, iteratively. | It is a reversed root-right-left traversal. ;; Or track the last visited node with one stack. | O(n)
Morris Inorder Traversal | H | Traverse a binary tree in order using constant extra space. | Threads back to the successor replace the stack. ;; Link each inorder predecessor to the current node, and remove the link on the second visit. | O(n) | O(1)
Left View of a Binary Tree | M | Return the nodes visible when a binary tree is viewed from the left. | You want the first node at each depth. ;; Depth-first, left child first, recording a node when its depth is new. | O(n)
Bottom View of a Binary Tree | M | Return the nodes visible when a binary tree is viewed from below. | Group nodes by horizontal distance from the root. ;; Level-order traversal, letting later nodes overwrite earlier ones. | O(n log n)
Top View of a Binary Tree | M | Return the nodes visible when a binary tree is viewed from above. | Group nodes by horizontal distance. ;; Level-order traversal, keeping only the first node per column. | O(n log n)
Preorder Inorder and Postorder in One Traversal | M | Produce all three depth-first orders in a single pass. | Each node is touched three times in a traversal. ;; Keep a state counter per stack entry. | O(n)
Vertical Order Traversal of a Binary Tree | H | Return nodes column by column, top to bottom, sorting ties in the same position by value. | Assign each node a (column, row) coordinate. ;; Collect triples and sort them. | O(n log n)
Root to Node Path in a Binary Tree | M | Return the path from the root to a given node. | Depth-first search with a path list. ;; Pop the node when neither subtree contains the target. | O(n)
Maximum Width of Binary Tree | M | Return the maximum width over all levels, counting gaps between the leftmost and rightmost nodes. | Number nodes as in a heap: children 2i and 2i+1. ;; Normalise indices per level to avoid overflow. | O(n)
` },
  { sheet, section: 'Day 18: Binary Tree II', topic: 'Trees', items: `
Binary Tree Level Order Traversal | M | Return node values level by level. | Use a queue. ;; Process exactly the current queue size per level. | O(n)
Maximum Depth of Binary Tree | E | Return the height of a binary tree. | Height is one plus the taller subtree. ;; Level-order counting also works. | O(n)
Diameter of Binary Tree | E | Return the length of the longest path between any two nodes. | The longest path through a node uses both subtree heights. ;; Compute heights and update a global best in the same recursion. | O(n)
Balanced Binary Tree | E | Decide whether the heights of every node's subtrees differ by at most one. | Recomputing heights at every node is quadratic. ;; Return -1 from the height function to signal imbalance. | O(n)
Lowest Common Ancestor of a Binary Tree | M | Find the lowest common ancestor of two nodes. | A node is the answer if the targets are found in different subtrees. ;; Return the non-null result upward. | O(n)
Same Tree | E | Decide whether two binary trees are structurally identical with equal values. | Compare node by node. ;; Both null is equal, one null is not. | O(n)
Binary Tree Zigzag Level Order Traversal | M | Return level order where alternate levels are reversed. | Normal level order with a direction flag. ;; Fill each level's array from the appropriate end. | O(n)
Boundary Traversal of a Binary Tree | M | Return the boundary anticlockwise: left boundary, leaves, then right boundary reversed. | Split into three parts. ;; Exclude leaves from the side boundaries to avoid duplicates. | O(n)
` },
  { sheet, section: 'Day 19: Binary Tree III', topic: 'Trees', items: `
Binary Tree Maximum Path Sum | H | Find the largest sum of any path between two nodes. | A path through a node uses the best downward path on each side. ;; Ignore negative contributions and update a global maximum. | O(n)
Construct Binary Tree from Preorder and Inorder Traversal | M | Rebuild a binary tree from its preorder and inorder traversals. | The first preorder value is the root. ;; Its position in inorder splits the subtrees; use a hash map for lookups. | O(n)
Construct Binary Tree from Inorder and Postorder Traversal | M | Rebuild a binary tree from its inorder and postorder traversals. | The last postorder value is the root. ;; Build the right subtree before the left when consuming from the end. | O(n)
Symmetric Tree | E | Decide whether a binary tree is a mirror image of itself. | Compare two subtrees as mirrors. ;; Left of one against right of the other. | O(n)
Flatten Binary Tree to Linked List | M | Flatten a binary tree into a right-skewed list in preorder, in place. | Process in reverse preorder. ;; Keep a pointer to the previously processed node. | O(n) | O(1)
Invert Binary Tree | E | Mirror a binary tree by swapping every node's children. | Swap, then recurse. ;; Any traversal order works. | O(n)
Children Sum Property | M | Modify node values by increments only so that each node equals the sum of its children. | Push larger values down before recursing. ;; Recompute the node from its children on the way back up. | O(n)
` },
  { sheet, section: 'Day 20: Binary Search Tree', topic: 'Binary Search Tree', items: `
Populating Next Right Pointers in Each Node | M | In a perfect binary tree, set each node's next pointer to its right neighbour. | The level above is already linked. ;; Use those links to connect children without a queue. | O(n) | O(1)
Search in a Binary Search Tree | E | Find the node with a given value in a BST. | Each comparison discards one subtree. ;; Go left or right iteratively. | O(h)
Convert Sorted Array to Binary Search Tree | E | Build a height-balanced BST from a sorted array. | The middle element makes a balanced root. ;; Recurse on both halves. | O(n)
Construct Binary Search Tree from Preorder Traversal | M | Rebuild a BST from its preorder traversal. | Each subtree's values fall within a range. ;; Pass an upper bound down and consume values while they fit. | O(n)
Validate Binary Search Tree | M | Decide whether a binary tree is a valid BST. | Checking only a node's children is not enough. ;; Pass down allowed (low, high) bounds, or check that inorder is increasing. | O(n)
Lowest Common Ancestor of a Binary Search Tree | M | Find the lowest common ancestor of two nodes in a BST. | Use the ordering. ;; The answer is the first node whose value lies between the two targets. | O(h)
Inorder Successor in BST | M | Find the node with the smallest value greater than a given node's value. | Walk from the root. ;; Record a candidate every time you go left. | O(h)
` },
  { sheet, section: 'Day 21: Binary Search Tree II', topic: 'Binary Search Tree', items: `
Floor in a BST | M | Find the largest value in a BST that is not greater than a key. | Walk down comparing with the key. ;; Record a candidate each time you move right. | O(h)
Ceil in a BST | M | Find the smallest value in a BST that is not less than a key. | Walk down comparing with the key. ;; Record a candidate each time you move left. | O(h)
Kth Smallest Element in a BST | M | Return the k-th smallest value in a BST. | Inorder traversal visits values in sorted order. ;; Stop as soon as the counter reaches k. | O(h+k)
Kth Largest Element in a BST | M | Return the k-th largest value in a BST. | Reverse the usual inorder. ;; Visit right, node, then left. | O(h+k)
Two Sum IV - Input is a BST | E | Decide whether two nodes of a BST sum to a target. | A set of seen values works. ;; Two iterators, one ascending and one descending, give O(h) space. | O(n)
Binary Search Tree Iterator | M | Implement an inorder iterator over a BST with next and hasNext in average constant time. | Do not materialise the whole traversal. ;; Keep a stack holding the left spine. | O(1) amortised
Largest BST in a Binary Tree | H | Find the size of the largest subtree that is a valid BST. | Collect information bottom-up. ;; Each call returns size, minimum and maximum, or a marker for not-a-BST. | O(n)
Serialize and Deserialize Binary Tree | H | Convert a binary tree to a string and back. | Record null children explicitly. ;; Preorder with null markers can be rebuilt by consuming tokens in order. | O(n)
` },
  { sheet, section: 'Day 22: Mixed Questions', topic: 'Heap', items: `
Binary Tree to Doubly Linked List | M | Convert a binary tree to a doubly linked list in inorder, in place. | Inorder traversal with a previous pointer. ;; Link previous.right to current and current.left to previous. | O(n)
Kth Largest Element in a Stream | E | Design a class that returns the k-th largest element after each insertion. | You never need more than k values. ;; Keep a min heap of size k. | O(log k) per add
Count Distinct Elements in Every Window | M | For each window of size k, report how many distinct values it contains. | Keep counts for the current window. ;; Add the incoming value, decrement the outgoing one, delete it at zero. | O(n)
Flood Fill | E | Starting from a pixel, recolour its whole connected region of the same colour. | Depth-first or breadth-first from the start pixel. ;; Guard against the case where the new colour equals the old one. | O(m*n)
` },
  { sheet, section: 'Day 23: Graph', topic: 'Graphs', items: `
Clone Graph | M | Return a deep copy of a connected undirected graph. | Map each original node to its clone. ;; Create the clone before recursing into neighbours to handle cycles. | O(V+E)
Depth First Search of a Graph | E | Return the depth-first traversal order of a graph from a start node. | Mark a node visited when you enter it. ;; Loop over all nodes to cover disconnected components. | O(V+E)
Breadth First Search of a Graph | E | Return the breadth-first traversal order of a graph from a start node. | Use a queue. ;; Mark nodes visited when they are enqueued, not when dequeued. | O(V+E)
Detect Cycle in an Undirected Graph | M | Decide whether an undirected graph contains a cycle. | A visited neighbour that is not your parent closes a cycle. ;; Union-find also detects it edge by edge. | O(V+E)
Detect Cycle in a Directed Graph | M | Decide whether a directed graph contains a cycle. | Visited alone is not enough; you need to know what is on the current path. ;; Three colours in DFS, or Kahn's algorithm leaving nodes unprocessed. | O(V+E)
Topological Sort | M | Return an ordering of a DAG in which every edge goes from earlier to later. | Nodes with no incoming edges can go first. ;; Kahn's algorithm with in-degrees, or reverse DFS finish order. | O(V+E)
Number of Islands | M | Count groups of connected land cells in a grid. | Each unvisited land cell starts a new island. ;; Flood fill from it to mark the whole island. | O(m*n)
Is Graph Bipartite? | M | Decide whether a graph's nodes can be split into two groups with no edge inside a group. | Try to two-colour the graph. ;; A neighbour with the same colour is a contradiction. | O(V+E)
` },
  { sheet, section: 'Day 24: Graph II', topic: 'Graphs', items: `
Strongly Connected Components | H | Count the strongly connected components of a directed graph. | Process nodes in order of DFS finishing time. ;; Kosaraju: run DFS on the reversed graph in that order. | O(V+E)
Dijkstra's Shortest Path | M | Find the shortest distances from a source in a graph with non-negative weights. | Always settle the closest unsettled node. ;; Use a min heap and skip stale entries. | O(E log V)
Bellman-Ford Algorithm | M | Find shortest distances from a source when edges may be negative, and detect negative cycles. | Relax every edge repeatedly. ;; V-1 rounds suffice; improvement in a further round means a negative cycle. | O(V*E)
Floyd-Warshall Algorithm | M | Find the shortest distance between every pair of nodes. | Allow intermediate nodes one at a time. ;; The loop over the intermediate node must be the outermost. | O(V^3)
Minimum Spanning Tree using Prim's Algorithm | M | Find the total weight of a minimum spanning tree. | Grow one tree by its cheapest outgoing edge. ;; A min heap of candidate edges with a visited set. | O(E log V)
Minimum Spanning Tree using Kruskal's Algorithm | M | Find the total weight of a minimum spanning tree by considering edges in order. | Sort edges by weight. ;; Union-find rejects edges that would form a cycle. | O(E log E)
` },
  { sheet, section: 'Day 25: Dynamic Programming', topic: 'Dynamic Programming', items: `
Maximum Product Subarray | M | Find the contiguous subarray with the largest product. | A negative number flips the largest and smallest products. ;; Track both the running maximum and minimum. | O(n) | O(1)
Longest Increasing Subsequence | M | Return the length of the longest strictly increasing subsequence. | The quadratic DP considers every earlier element. ;; Keep the smallest possible tail for each length and binary search. | O(n log n)
Longest Common Subsequence | M | Return the length of the longest subsequence common to two strings. | Compare the last characters of the two prefixes. ;; Match extends the diagonal; otherwise take the better of dropping one character. | O(m*n)
0/1 Knapsack | M | Choose items with weights and values to maximise value within a capacity; each item is used at most once. | State: items considered and remaining capacity. ;; A one-dimensional array works if capacity is iterated downward. | O(n*W)
Edit Distance | M | Find the minimum number of insertions, deletions and replacements to turn one string into another. | Define the answer for prefixes. ;; Each cell takes the minimum of three neighbours plus one. | O(m*n)
Maximum Sum Increasing Subsequence | M | Find the largest sum of a strictly increasing subsequence. | Same shape as longest increasing subsequence. ;; Store the best sum ending at each index. | O(n^2)
Matrix Chain Multiplication | H | Find the minimum number of scalar multiplications needed to multiply a chain of matrices. | Choose where to make the final split. ;; Interval DP over increasing chain lengths. | O(n^3)
` },
  { sheet, section: 'Day 26: Dynamic Programming II', topic: 'Dynamic Programming', items: `
Minimum Path Sum | M | Find the path from the top-left to the bottom-right of a grid, moving right or down, with the smallest sum. | Each cell is reached from above or from the left. ;; The grid itself can hold the DP values. | O(m*n)
Coin Change | M | Find the fewest coins needed to make an amount, or -1 if impossible. | Greedy fails for arbitrary denominations. ;; dp[a] is one more than the best dp[a - coin]. | O(amount * coins)
Subset Sum Problem | M | Decide whether some subset of an array sums to a target. | It is a boolean knapsack. ;; A one-dimensional array iterated downward avoids reusing an item. | O(n * target)
Rod Cutting | M | Given prices for each length, find the maximum revenue from cutting a rod of length n. | Each length may be used many times. ;; This is an unbounded knapsack over lengths. | O(n^2)
Super Egg Drop | H | With k eggs and n floors, find the minimum number of drops needed in the worst case to find the critical floor. | The direct DP over floors is too slow. ;; Ask instead how many floors can be covered with m moves and k eggs. | O(k log n)
Word Break | M | Decide whether a string can be segmented into dictionary words. | dp[i] says whether the prefix of length i can be segmented. ;; Only try word lengths that exist in the dictionary. | O(n^2)
Palindrome Partitioning II | H | Find the minimum number of cuts so that every piece of a string is a palindrome. | Precompute which substrings are palindromes. ;; cuts[i] is the minimum over palindromic suffixes ending at i. | O(n^2)
Maximum Profit in Job Scheduling | H | Each job has a start, end and profit. Choose non-overlapping jobs to maximise profit. | Sort by end time. ;; For each job, binary search the last job that ends before it starts. | O(n log n)
` },
  { sheet, section: 'Day 27: Trie', topic: 'Trie', items: `
Implement Trie (Prefix Tree) | M | Implement insert, search and startsWith for a trie. | Each node maps characters to children. ;; Mark nodes where a word ends. | O(length) per operation
Implement Trie II | M | Extend a trie to count words equal to a string, count words with a prefix, and erase a word. | Store two counters on each node. ;; One for words ending here, one for words passing through. | O(length) per operation
Longest Word with All Prefixes | M | Find the longest word such that every one of its prefixes is also in the list; break ties lexicographically. | Insert all words into a trie. ;; A word qualifies if every node on its path ends a word. | O(total characters)
Count Distinct Substrings | M | Count the distinct substrings of a string. | Insert every suffix into a trie. ;; Each newly created node is a new distinct substring. | O(n^2)
Subsets | M | Return all subsets of a set of distinct integers. | Each subset corresponds to an n-bit mask. ;; Iterate over masks from 0 to 2^n - 1. | O(n * 2^n)
Maximum XOR of Two Numbers in an Array | M | Find the maximum XOR of any two numbers in an array. | Decide the answer bit by bit from the most significant. ;; A binary trie lets you choose the opposite bit greedily. | O(32n)
Maximum XOR With an Element From Array | H | For each query (x, m), find the maximum XOR of x with any array element not exceeding m. | Answer queries offline in increasing order of m. ;; Insert array elements into a binary trie as they become allowed. | O((n+q) log n)
` },
];
