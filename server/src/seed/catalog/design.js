// Format: Title | E/M/H | statement | hint ;; hint | target time | target space
const scope = 'Talk through requirements, capacity estimates, API, data model, architecture and trade-offs. Use the editor as a scratchpad.';

export const DESIGN = [
  { topic: 'Design', items: `
Design HashMap | E | Implement a hash map without built-in hash tables. | Array of buckets. ;; Resolve collisions with chaining. | O(1) average
Design HashSet | E | Implement a hash set without built-in hash tables. | Buckets with chaining. ;; Resize when the load factor grows. | O(1) average
Design Twitter | M | Support posting, following and fetching the ten most recent tweets in a feed. | Store tweets per user with a global timestamp. ;; Merge the followees' lists with a heap. | O(k log k) per feed
Design Underground System | M | Track check-ins and check-outs to report average travel times. | Map each rider to their check-in. ;; Map each station pair to total time and count. | O(1) per operation
Design Parking System | E | Track free spaces for three car sizes. | Three counters. ;; Decrement when available. | O(1)
Snapshot Array | M | Support set, snapshot and reading a value as of a snapshot. | Store a history per index. ;; Binary search the snapshot id. | O(log s) per get
Design a Text Editor | H | Support adding, deleting and moving a cursor in text. | Two stacks around the cursor. ;; Left of the cursor and right of the cursor. | O(k) per operation
Range Module | H | Track ranges of numbers with add, remove and query. | Keep disjoint sorted intervals. ;; Merge or split around the affected range. | O(n) per update
Design Search Autocomplete System | H | Suggest the top three historical sentences for a typed prefix. | Trie of sentences. ;; Keep counts and rank matching sentences. | O(prefix + matches)
Design File System | M | Create paths with values only when the parent exists, and read them. | Map of path to value. ;; Check the parent path on create. | O(length)
Design In-Memory File System | H | Support ls, mkdir, adding content to files and reading files. | Trie of directories. ;; Each node holds children and optional file content. | O(path length)
Tic-Tac-Toe Winner Tracker | M | Report the winner after each move on an n x n board in constant time. | Count per row, column and diagonal. ;; Use plus one and minus one for the two players. | O(1) per move
Design Leaderboard | M | Add scores, reset players and sum the top k scores. | Map of player to score. ;; A sorted multiset or heap for the top k. | O(k log n)
Stock Price Fluctuation | M | Record timestamped prices with corrections and report current, maximum and minimum. | Map of timestamp to price. ;; Heaps with lazy validation for the extremes. | O(log n) per operation
Design a Rate Limiter Class | M | Implement a sliding-window limiter allowing n requests per window per client. | Queue of timestamps per client. ;; Evict timestamps older than the window. | O(1) amortised
All O'one Data Structure | H | Increment and decrement string counts and return a key with the max and min count, all in constant time. | Doubly linked list of count buckets. ;; Map each key to its bucket. | O(1) per operation
Time Map with Snapshots | M | Store versions of values and query the value at a version. | Append versions in order. ;; Binary search by version. | O(log n) per get
Design a Food Rating System | M | Change ratings and return the highest-rated food per cuisine. | Sorted set per cuisine. ;; Or heaps with lazy deletion. | O(log n) per operation
Design a Number Container System | M | Assign numbers to indices and find the smallest index holding a number. | Map of index to number. ;; Sorted set of indices per number. | O(log n) per operation
Iterator for Combination | M | Iterate over all combinations of a given length in lexicographic order. | Keep the current index tuple. ;; Advance the rightmost index that can move. | O(k) per next
Peeking Iterator | M | Add a peek operation to an iterator. | Cache the next element. ;; Refill the cache after next. | O(1)
Zigzag Iterator | M | Alternate between several lists when iterating. | Queue of iterators. ;; Re-enqueue an iterator that still has elements. | O(1) per next
` },
  { topic: 'System Design', type: 'system-design', items: `
Design a URL Shortener | M | Design a service that turns long URLs into short links and redirects visitors. ${scope} | Start from the numbers: redirects per second and storage over five years. ;; Compare hashing, a base-62 counter and pre-generated key ranges.
Design a Rate Limiter | M | Design a distributed rate limiter for an API gateway. ${scope} | Compare token bucket, leaky bucket and sliding window counters. ;; Where is the state kept, and what happens when that store is slow?
Design a News Feed | H | Design the home timeline of a social network. ${scope} | Fan-out on write versus fan-out on read. ;; Celebrity accounts usually need a hybrid.
Design a Chat System | H | Design one-to-one and group messaging with delivery receipts and presence. ${scope} | How do messages reach a user who is online on several devices? ;; Decide ordering guarantees and how you assign message identifiers.
Design a Web Crawler | H | Design a crawler that fetches billions of pages politely. ${scope} | The URL frontier needs prioritisation and per-host politeness. ;; How do you detect duplicate URLs and duplicate content?
Design a Notification System | M | Design a service that sends push, SMS and email notifications at scale. ${scope} | Decouple producers from providers with queues. ;; Think about retries, deduplication and user preferences.
Design a Typeahead Service | M | Design search suggestions that update as the user types. ${scope} | Precompute top suggestions per prefix. ;; How fresh do suggestions need to be, and how are they updated?
Design a Distributed Cache | H | Design a horizontally scalable in-memory cache. ${scope} | Consistent hashing limits remapping when nodes change. ;; Pick an eviction policy and a replication strategy.
Design a Key-Value Store | H | Design a highly available distributed key-value store. ${scope} | Choose your position on consistency versus availability. ;; Quorums, vector clocks and hinted handoff are the usual tools.
Design a Video Streaming Platform | H | Design upload, processing and playback for a video service. ${scope} | Transcode into several bitrates and segment the output. ;; A CDN serves most traffic; what stays at the origin?
Design a Ride Sharing Service | H | Design matching between riders and nearby drivers. ${scope} | Index driver locations with geohashes or a quadtree. ;; Location updates are frequent: how do you keep them cheap?
Design a File Storage and Sync Service | H | Design a service like a cloud drive with sync across devices. ${scope} | Split files into chunks and deduplicate. ;; How are conflicting edits detected and resolved?
Design a Ticket Booking System | H | Design seat booking for events with heavy contention. ${scope} | Two users must never get the same seat. ;; Temporary holds with expiry, and how you enforce them.
Design an Online Code Judge | M | Design a system that runs untrusted code submissions against tests. ${scope} | Isolation and resource limits come first. ;; Use a queue between submission and execution, and decide how results are delivered.
Design a Metrics and Monitoring System | H | Design ingestion, storage and querying of time-series metrics. ${scope} | Write volume dominates. ;; Downsampling and retention policies control storage.
Design a Payment System | H | Design a system that processes payments reliably. ${scope} | Idempotency keys prevent double charges. ;; A ledger with double-entry records makes reconciliation possible.
Design a Unique ID Generator | M | Design a service that produces unique, roughly sortable IDs across data centres. ${scope} | Combine a timestamp, a machine identifier and a sequence. ;; What happens when a clock moves backwards?
Design a Search Engine Index | H | Design indexing and querying for full-text search. ${scope} | An inverted index maps terms to documents. ;; Shard the index, and decide how results are ranked and merged.
Design a Job Scheduler | M | Design a distributed scheduler for delayed and recurring jobs. ${scope} | Jobs must run at least once even if a worker dies. ;; Leases with heartbeats, and idempotent job handlers.
Design a Collaborative Document Editor | H | Design real-time collaborative editing of a document. ${scope} | Concurrent edits must converge. ;; Compare operational transformation with CRDTs.
` },
];
