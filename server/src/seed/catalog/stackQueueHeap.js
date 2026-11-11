// Format: Title | E/M/H | statement | hint ;; hint | target time | target space
export const STACK_QUEUE_HEAP = [
  { topic: 'Stack', items: `
Evaluate Reverse Polish Notation | M | Evaluate an arithmetic expression given in postfix notation. | Push numbers. ;; An operator pops two operands; mind the order and truncation toward zero. | O(n)
Daily Temperatures | M | For each day, find how many days until a warmer temperature. | Days waiting for an answer have decreasing temperatures. ;; Monotonic stack of indices. | O(n)
Next Greater Element II | M | Find the next greater element for each position in a circular array. | Walk the array twice. ;; Use indices modulo n with a monotonic stack. | O(n)
Asteroid Collision | M | Simulate asteroids moving left and right; equal sizes destroy each other and larger ones survive. | Only a right-mover followed by a left-mover collides. ;; Resolve collisions against the stack top in a loop. | O(n)
Remove K Digits | M | Remove k digits from a number to make it as small as possible. | A larger digit before a smaller one should go. ;; Monotonic stack, then strip leading zeros. | O(n)
Remove Duplicate Letters | M | Remove duplicate letters so each appears once and the result is lexicographically smallest. | Pop a larger letter if it appears again later. ;; Track last occurrences and what is already in the stack. | O(n)
132 Pattern | M | Decide whether indices i < j < k exist with a[i] < a[k] < a[j]. | Scan from the right. ;; The stack holds candidates for the 3; popped values become the best 2. | O(n)
Car Fleet | M | Cars drive toward a target and cannot pass each other. Count the fleets that arrive. | Sort by starting position. ;; From the front, a car joins a fleet if it would arrive no later. | O(n log n)
Sum of Subarray Minimums | M | Sum the minimum of every contiguous subarray. | Count the subarrays in which each element is the minimum. ;; Use previous-less and next-less-or-equal boundaries. | O(n)
Sum of Subarray Ranges | M | Sum max minus min over all subarrays. | Sum of maximums minus sum of minimums. ;; Each comes from a monotonic stack. | O(n)
Maximum Width Ramp | M | Find the widest pair i < j with a[i] <= a[j]. | Candidate left ends form a decreasing sequence. ;; Scan from the right and pop while it works. | O(n)
Score of Parentheses | M | Compute the score of a balanced parentheses string under nesting and concatenation rules. | Only innermost pairs contribute. ;; Each contributes a power of two based on depth. | O(n)
Validate Stack Sequences | M | Decide whether a pop order is possible for a given push order. | Simulate. ;; After each push, pop while the top matches. | O(n)
Exclusive Time of Functions | M | Compute the exclusive running time of each function from start and end logs. | Stack of running functions. ;; Charge elapsed time to the function on top. | O(n)
Flatten Nested List Iterator | M | Implement an iterator over a nested list of integers. | Stack of pending items. ;; Unpack lists lazily in hasNext. | O(1) amortised
Mini Parser | M | Parse a string encoding of a nested list of integers. | Stack of lists under construction. ;; Close a list on the bracket and attach it to its parent. | O(n)
Number of Visible People in a Queue | H | For each person, count the people to their right they can see. | Monotonic stack from the right. ;; Each pop is someone visible, plus one more if the stack is not empty. | O(n)
Maximum Frequency Stack | H | Design a stack that pops the most frequent element, breaking ties by recency. | Group elements by frequency. ;; Keep a stack per frequency and the current maximum. | O(1) per operation
Design a Stack With Increment Operation | M | Support push, pop and increment of the bottom k elements. | Applying increments eagerly is slow. ;; Store a lazy increment at index k - 1 and pass it down on pop. | O(1) per operation
Baseball Game | E | Compute a score from operations that add, double, sum or invalidate previous scores. | Stack of scores. ;; Each operation touches only the top one or two. | O(n)
Crawler Log Folder | E | Count the steps needed to return to the main folder after a list of folder changes. | Track depth. ;; Depth never goes below zero. | O(n)
Make The String Great | E | Remove adjacent pairs of the same letter in different cases until none remain. | Stack. ;; Pop when the top and the incoming letter differ only by case. | O(n)
Build an Array With Stack Operations | E | Produce the push and pop sequence that builds a target from the stream 1..n. | Walk the numbers in order. ;; Push then pop anything not in the target. | O(n)
Remove Outermost Parentheses | E | Strip the outermost pair from each primitive parentheses group. | Track depth. ;; Skip characters that open or close depth one. | O(n)
Final Prices With a Special Discount in a Shop | E | Each price is reduced by the next price that is not larger. | Next smaller-or-equal element. ;; Monotonic stack. | O(n)
Minimum Insertions to Balance a Parentheses String | M | Each opener needs two consecutive closers. Find the fewest insertions. | Track how many closers are still needed. ;; Handle an odd need when an opener arrives. | O(n)
Longest Absolute File Path | M | Given a text representation of a file tree, find the longest path to a file. | Depth is the number of tabs. ;; Store the path length at each depth. | O(n)
Online Maximum Stack | H | Design a stack supporting peekMax and popMax. | Two structures over the same nodes. ;; A linked list plus an ordered map, or two heaps with lazy deletion. | O(log n) per operation
Trapping Rain Water using a Stack | H | Compute trapped water by processing bars with a stack. | Pop a bar when a taller one arrives. ;; Water is bounded by the new top and the current bar. | O(n)
Check If Word Is Valid After Substitutions | M | Decide whether a string can be built by repeatedly inserting abc. | Reverse the process. ;; Pop a and b when c arrives. | O(n)
` },
  { topic: 'Queue', items: `
Number of Recent Calls | E | Count the requests within the last 3000 milliseconds. | Requests arrive in order. ;; Drop expired times from the front of a queue. | O(1) amortised
Design Circular Queue | M | Implement a fixed-size circular queue. | Array with head index and size. ;; Use modulo arithmetic for wraparound. | O(1) per operation
Design Circular Deque | M | Implement a fixed-size double-ended queue. | Circular buffer. ;; Moving the head backward needs care with negative modulo. | O(1) per operation
Moving Average from Data Stream | E | Return the average of the last k values of a stream. | Queue with a running sum. ;; Subtract the value that leaves. | O(1) per value
Dota2 Senate | M | Two parties ban each other in rounds. Predict the winner. | Queue of indices for each party. ;; The earlier index wins and rejoins at index + n. | O(n)
Reveal Cards In Increasing Order | M | Order a deck so that revealing with a take-one, move-one process shows increasing values. | Simulate on indices. ;; Assign sorted values to the simulated order. | O(n log n)
Time Needed to Buy Tickets | E | People queue to buy tickets one at a time; find when person k finishes. | No simulation needed. ;; People ahead buy up to t[k]; those behind buy up to t[k] - 1. | O(n)
First Negative Integer in Every Window of Size K | M | For each window of size k, report its first negative number. | Queue of indices of negatives. ;; Drop indices that leave the window. | O(n)
Jump Game VI | M | Jump at most k steps forward to maximise the sum of visited values. | dp[i] needs the maximum of the previous k values. ;; A monotonic deque provides it. | O(n)
Constrained Subsequence Sum | H | Find the maximum subsequence sum where consecutive chosen indices are at most k apart. | dp[i] is the value plus the best dp in the previous k, if positive. ;; Monotonic deque. | O(n)
Design Hit Counter | M | Count hits in the past five minutes. | Queue of timestamps. ;; Or 300 buckets holding a timestamp and a count. | O(1) amortised
Generate Binary Numbers from 1 to N | E | Generate the binary representations of 1..n using a queue. | Start with "1". ;; Each dequeued string enqueues itself with 0 and with 1 appended. | O(n)
Reverse First K Elements of a Queue | E | Reverse the first k elements of a queue. | Stack for the first k. ;; Then rotate the remaining elements. | O(n)
Interleave the First Half of a Queue with the Second Half | M | Interleave the two halves of a queue of even length. | Use a stack to control the order. ;; Several transfers are needed. | O(n)
` },
  { topic: 'Heap', items: `
Last Stone Weight | E | Repeatedly smash the two heaviest stones; return the last weight. | Max heap. ;; Push back the difference when it is not zero. | O(n log n)
K Closest Points to Origin | M | Return the k points closest to the origin. | Max heap of size k. ;; Quickselect is linear on average. | O(n log k)
Task Scheduler | M | Find the minimum time to run tasks with a cooldown between equal tasks. | The most frequent task sets the frame. ;; The answer is the larger of the task count and the frame formula. | O(n)
Ugly Number II | M | Find the n-th number whose only prime factors are 2, 3 and 5. | Each ugly number is a smaller one times 2, 3 or 5. ;; Three pointers into the sequence. | O(n)
Find K Pairs with Smallest Sums | M | Return k pairs, one element from each sorted array, with the smallest sums. | Start with pairs using the first element of the second array. ;; Advance the second index when popping from a heap. | O(k log k)
Meeting Rooms III | H | Assign meetings to the lowest free room, delaying when none is free; find the busiest room. | Heap of free rooms and heap of busy rooms by end time. ;; Delay a meeting by its wait while keeping its duration. | O(n log n)
IPO | H | Choose at most k projects to maximise capital, each needing a minimum capital. | Sort projects by required capital. ;; Max heap of profits among affordable projects. | O(n log n)
Minimum Cost to Connect Sticks | M | Join sticks pairwise, each join costing the sum of lengths; minimise the total. | Always join the two shortest. ;; Min heap. | O(n log n)
Furthest Building You Can Reach | M | Use bricks or ladders for climbs between buildings; find how far you can get. | Ladders should cover the largest climbs. ;; Keep a min heap of climbs assigned to ladders. | O(n log k)
Single-Threaded CPU | M | Simulate a CPU that always picks the shortest available task. | Sort by enqueue time. ;; Min heap by processing time then index. | O(n log n)
Process Tasks Using Servers | M | Assign tasks to the lightest free server, waiting when none is free. | Heap of free servers and heap of busy servers. ;; Jump time forward when no server is free. | O((n+m) log n)
Seat Reservation Manager | M | Reserve the smallest free seat and release seats. | Min heap of free seats. ;; A counter for seats never used keeps setup cheap. | O(log n) per operation
Smallest Range Covering Elements from K Lists | H | Find the smallest range containing at least one number from each of k sorted lists. | Min heap with one element per list. ;; Track the current maximum and advance the minimum. | O(N log k)
Reorganize Tasks with Maximum Heap | M | Arrange characters so equal ones are at least distance k apart. | Take the most frequent available letter. ;; Hold used letters in a queue until they cool down. | O(n log 26)
The Skyline Problem | H | Compute the outline of a set of rectangular buildings. | Sweep over building edges. ;; A max heap of active heights; emit a point when the maximum changes. | O(n log n)
Minimum Number of Refueling Stops | H | Find the fewest refuelling stops needed to reach a target. | Pass stations and remember them. ;; When out of fuel, take the largest station seen so far. | O(n log n)
Swim in Rising Water | H | Find the minimum time to swim across a grid where water rises each unit of time. | Minimise the maximum elevation on the path. ;; Dijkstra with a min heap. | O(n^2 log n)
Kth Smallest Prime Fraction | M | Find the k-th smallest fraction formed from a sorted list of primes. | Heap over numerator pointers. ;; Or binary search on the fraction value. | O(n log(range))
Sort Characters by Frequency with a Heap | M | Rebuild a string in order of decreasing letter frequency using a heap. | Count letters. ;; Pop from a max heap of counts. | O(n log 26)
Minimum Operations to Halve Array Sum | M | Halve elements repeatedly to cut the total by at least half in the fewest steps. | Always halve the largest. ;; Max heap of floats. | O(n log n)
Total Cost to Hire K Workers | M | Hire k workers, each time choosing the cheapest among the first and last candidates. | Two heaps, one for each end. ;; Refill from the middle with two pointers. | O((k+c) log c)
Maximum Subsequence Score | M | Choose k indices to maximise the sum from one array times the minimum from another. | Sort by the second array descending. ;; Keep the k largest values of the first in a min heap. | O(n log n)
K-th Smallest Element in a Multiplication Table | H | Find the k-th smallest value in an m x n multiplication table. | Binary search the value. ;; Count entries not above it row by row. | O(m log(m*n))
Find K-th Smallest Pair Distance | H | Find the k-th smallest absolute difference among all pairs. | Sort, then binary search the distance. ;; Count pairs within a distance using two pointers. | O(n log n + n log(range))
Maximum Performance of a Team | H | Pick at most k engineers to maximise total speed times minimum efficiency. | Sort by efficiency descending. ;; Keep the top speeds in a min heap. | O(n log n)
Minimum Cost to Hire K Workers | H | Hire k workers paying proportionally to quality and at least each one's minimum wage. | The pay rate is set by the worst wage-to-quality ratio in the group. ;; Sort by ratio and keep the smallest qualities in a max heap. | O(n log n)
Reduce Array Size to The Half | M | Remove the fewest distinct values so at least half of the array is gone. | Count frequencies. ;; Remove the most frequent first. | O(n log n)
Connect Ropes with Minimum Cost | E | Connect ropes pairwise at a cost equal to their combined length; minimise the total. | Greedy on the two shortest. ;; Min heap. | O(n log n)
K Largest Elements in a Stream of Arrays | M | Return the k largest values across several arrays. | Min heap of size k. ;; Replace the top when a larger value arrives. | O(N log k)
Rearrange String k Distance Apart | H | Rearrange a string so equal characters are at least k apart, or report impossible. | Greedy with a max heap. ;; A waiting queue enforces the distance. | O(n log 26)
Find the Kth Largest Integer in the Array | M | Numbers are given as strings without leading zeros. Find the k-th largest. | Compare by length, then lexicographically. ;; Sort or use a heap with that comparator. | O(n log n)
Sliding Window Maximum with a Heap | H | Solve sliding window maximum using a heap with lazy deletion. | Store value and index. ;; Discard tops whose index left the window. | O(n log n)
` },
  { topic: 'Sorting', items: `
Merge Sort an Array | M | Implement merge sort. | Split in half and recurse. ;; Merge with two pointers into a buffer. | O(n log n)
Quick Sort an Array | M | Implement quicksort with a good pivot strategy. | Partition around a pivot. ;; A random pivot avoids the quadratic worst case on sorted input. | O(n log n) average
Insertion Sort List | M | Sort a linked list using insertion sort. | A dummy head simplifies insertion. ;; Restart the search from the dummy only when needed. | O(n^2)
Sort List | M | Sort a linked list in O(n log n) time. | Merge sort suits linked lists. ;; Split with slow and fast pointers. | O(n log n)
Maximum Gap | M | Find the largest difference between successive elements in sorted order, in linear time. | Bucket the values. ;; The maximum gap is never inside a bucket of the right width. | O(n)
Sort Array by Increasing Frequency | E | Sort values by increasing frequency, breaking ties by decreasing value. | Count first. ;; Sort with a two-key comparator. | O(n log n)
Minimum Absolute Difference | E | Return all pairs with the minimum absolute difference. | Sort. ;; The minimum difference is between neighbours. | O(n log n)
Rank Transform of an Array | E | Replace each element with its rank among the distinct values. | Sort the distinct values. ;; Map value to rank. | O(n log n)
Sort the People | E | Sort names by decreasing height. | Sort indices by height. ;; Or pair the names with heights. | O(n log n)
Largest Perimeter Triangle | E | Find the largest perimeter of a valid triangle from given lengths. | Sort descending. ;; Check consecutive triples. | O(n log n)
Counting Sort | E | Sort an array of small non-negative integers in linear time. | Count occurrences. ;; Rebuild in order; prefix sums make it stable. | O(n + k)
Radix Sort | M | Sort non-negative integers digit by digit. | Use a stable sort per digit. ;; Start from the least significant digit. | O(d * (n + b))
Sort Integers by The Number of 1 Bits | E | Sort integers by their number of set bits, then by value. | Compute the bit count as the key. ;; Two-key comparator. | O(n log n)
Minimum Number of Moves to Seat Everyone | E | Move students to seats, minimising total distance. | Sort both arrays. ;; Pair them in order. | O(n log n)
Sort an Almost Sorted Array | M | Each element is at most k positions from its sorted place. Sort the array. | Only k + 1 candidates exist for each position. ;; Min heap of size k + 1. | O(n log k)
` },
];
