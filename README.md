# Whiteboard: AI mock interview and coding assessment platform

A live, voice-driven technical interview. The candidate solves a problem in a Monaco editor while an AI interviewer listens, watches the code as it is typed, interrupts when the approach is asymptotically too slow, runs the code in a locked-down Docker sandbox, and writes a feedback report in the background.

## Quick start

Requirements: Node 20+, Docker (Desktop or Engine) running.

```bash
npm run install:all        # server + client dependencies
npm run infra              # MongoDB + Redis via docker compose
npm run sandbox:pull       # python:3.10-slim, node:18-alpine and gcc:13 (optional: pulled on first run otherwise)
cp server/.env.example server/.env
npm run dev:server         # API + Socket.io + inline workers on :4000
npm run dev:client         # Vite on :5173 (second terminal)
```

Open http://localhost:5173 in Chrome or Edge (voice input uses the Web Speech API) and wear headphones so the microphone does not pick up the interviewer.

### Enabling the LLM interviewer

Without credentials the platform runs a rule-based interviewer so everything works offline: heuristic interruptions, canned probing questions and a heuristic report. Set `ANTHROPIC_API_KEY` in `server/.env` to switch to Claude (`AI_MODEL`, default `claude-opus-5-5`) for conversation, interruption judgement and the written report. `GET /api/health` reports which mode is active.

## Problem catalogue

1,137 problems across 26 topics, synced into MongoDB on every server start.

- **Striver's SDE Sheet**: 186 problems, grouped by the sheet's days. Pick the sheet chip on the home page.
- **Hints**: every problem has ordered hints, gentle first. A candidate reveals them one at a time during an interview; each one is counted and shown in the report, and the interviewer is told so it can build on it.
- **Graded problems**: 42 have a test suite with hidden cases. For 37 of them the expected outputs are computed from a reference solution in `server/src/seed/catalog/runnable.js`, so tests cannot drift from the answer key.
- **Everything else** has no test suite. Run executes the file as a script, the candidate supplies their own inputs, and the interviewer judges correctness.

Statements in the catalogue are short original summaries, as an interviewer would state them, not copies of any site's wording. Some entries are deliberate variants of one problem solved a different way (for example with a heap instead of a deque).

To add problems, append a line to a file in `server/src/seed/catalog/`:

```
Title | E/M/H | statement | hint one ;; hint two | target time | target space
```

To give one a test suite, add a spec (signature, inputs, reference solution, C++ types) to `runnable.js`.

## Languages

Python, JavaScript and C++ (GCC 13, C++17, `-O2`). C++ is built in a separate container with its own limits (20 s, 512 MB, 1 CPU by default), then the binary runs under the same limits as every other language, so compile time never eats into the 5 second run limit. For graded problems the C++ harness is generated from a typed signature such as `vector<int> twoSum(vector<int>& nums, int target)`.

## Architecture

```
Browser (React + Monaco + Web Speech)
   │  REST /api            create interview, fetch report
   │  Socket.io            code:change, code:run, candidate:message  ⇄  ai:stream:*, ai:interrupt, terminal:line, run:result
   ▼
API process (Express + Socket.io)
   ├─ sockets/interviewSocket.js   one room per interview, debounced review, rate limits
   ├─ services/aiAgent.js          streaming LLM turns, interruption trigger, report writer
   ├─ services/complexityAnalyzer  static heuristics: the cheap gate before any LLM call
   ├─ services/interviewState.js   Redis: live editor buffer, rolling LLM context, cooldown locks
   └─ BullMQ QueueEvents bridge    job progress/completion → Socket.io room
   ▼
Redis ── BullMQ queues: code-execution, report-generation
   ▼
Workers (inline, or `npm run dev:worker` as separate processes)
   ├─ execution → services/sandboxEngine.js → ephemeral Docker container
   └─ report    → aiAgent.generateReport  → MongoDB
```

MongoDB holds the durable records (`Problem`, `Interview` with transcript and runs, `Report`). Redis holds everything hot and disposable.

### AI interviewer (`server/src/services/aiAgent.js`)

- **Streaming speech.** Each turn streams tokens over `ai:stream:delta`. The client speaks whole sentences as they complete, so the interviewer starts talking before the response has finished generating.
- **Interruption trigger.** 1.5 s after the candidate stops typing (and again when they press Run), the static analyser scans the buffer for nested loops and linear-time calls inside loops. Only if something is worse than the problem's target complexity is the LLM asked for a structured verdict (interrupt or not, line range, time/space complexity, what to say). A confirmed problem is emitted as `ai:interrupt`: the editor highlights the lines, and the TTS cuts off whatever was being said. Each code region can only trigger one interruption per 90 s.
- **Barge-in.** If the candidate talks over the interviewer, playback stops and the in-flight LLM stream is aborted server-side.
- **Refusal fallback.** Conversation turns opt into server-side model fallback, so a safety-classifier decline is retried on a fallback model inside the same request instead of leaving silence.
- **Prompt caching.** Persona and problem statement form a stable, cacheable system prefix; the editor snapshot travels in the last user turn.

### Code sandbox (`server/src/services/sandboxEngine.js`)

Every run gets a fresh container that is removed afterwards:

| Control | Setting |
|---|---|
| Memory | 128 MB, swap disabled |
| CPU | 0.5 core (`CpuQuota` 50000 / `CpuPeriod` 100000) |
| Network | `NetworkMode: none` |
| Wall clock | 5 s hard kill |
| Filesystem | read-only root, read-only workspace bind mount, 16 MB noexec `/tmp` |
| Privileges | user `nobody`, all capabilities dropped, `no-new-privileges` |
| Processes / files | 64 PIDs, 256 open files, 8 MB max file size |
| Output | 64 KB cap per stream |

Expected outputs never enter the container. The harness reports what the candidate's function returned and the comparison happens on the host. Hidden test inputs, expected values and the candidate's output for them are stripped before results leave the server.

## Testing

```bash
npm test                                        # catalogue, analyser and sandbox tests (sandbox ones need Docker)
npm --prefix server run test:suites             # every generated test suite against its reference solution
npm --prefix server run test:cpp                # every C++ harness compiles and parses its inputs
API_URL=http://localhost:4000 npm --prefix server run test:e2e   # full interview against a running server
E2E_LANGUAGE=cpp API_URL=http://localhost:4000 npm --prefix server run test:e2e
```

## Configuration

See `server/.env.example`. Notable settings: `RUN_WORKERS_INLINE=false` to run workers as separate, horizontally scaled processes; `SANDBOX_*` for images and limits; `DOCKER_SOCKET` to point at a non-default Docker endpoint; `CLIENT_ORIGIN` (comma-separated) for CORS.

## Deploying

The platform has two halves that must be hosted differently.

| Part | What it needs | Where it can run |
|---|---|---|
| Client (React build) | Static file hosting | Vercel, Netlify, or any CDN |
| Backend (API, Socket.io, workers, sandbox) | A long-running process, WebSockets, Redis, MongoDB and a Docker daemon it can start containers on | A Linux server (VPS) with Docker |

The backend cannot run on Vercel or Netlify. Their functions are short-lived and cannot hold WebSocket connections, run queue workers, or start Docker containers, and the code sandbox depends on all three.

### Quick option: backend on your own machine through a Cloudflare tunnel

For demos and testing you can skip the server. `docker-compose.tunnel.yml` runs the backend in Docker on your machine and publishes it through a free Cloudflare quick tunnel: no account, no domain, no open ports.

```bash
npm run tunnel:up        # build and start api, mongo, redis and the tunnel
```

```bash
npm run tunnel:url       # look for the https://….trycloudflare.com address
```

Put that address in `VITE_API_URL` on Vercel or Netlify and redeploy the site. Settings live in `deploy.env`; `CLIENT_ORIGIN` there accepts exact origins, patterns such as `https://*.vercel.app`, or `*`.

Know the limits before relying on it:

- The address is random and changes whenever the tunnel container restarts (including after a reboot), and the site must then be rebuilt with the new one. A named Cloudflare tunnel on your own domain gives a fixed address.
- Your computer has to stay on, awake and running Docker.
- Anyone who learns the address can start interviews and run code in the sandbox on your machine. Stop it with `npm run tunnel:down` when you are not using it.

### 1. Backend on a Linux server

Any provider's VPS works (2 vCPU and 4 GB RAM is a comfortable start). Point a domain such as `api.example.com` at it, install Docker, copy this repository over, then:

```bash
cp deploy.env.example deploy.env      # set API_DOMAIN, CLIENT_ORIGIN and optionally ANTHROPIC_API_KEY
docker compose -f docker-compose.prod.yml --env-file deploy.env up -d --build
```

Caddy obtains the HTTPS certificate automatically. Check `https://api.example.com/api/health`.

### 2. Client on Vercel or Netlify

Both are configured already (`vercel.json`, `netlify.toml`). Import the repository in either dashboard, or use the CLI from the project root:

```bash
npx vercel --prod
```

```bash
npx netlify deploy --prod
```

In the project's environment variables set `VITE_API_URL` to the backend origin (for example `https://api.example.com`) before building, then set `CLIENT_ORIGIN` in `deploy.env` to the site URL you are given and restart the backend so CORS allows it.

## Before exposing this to the internet

These are deliberately out of scope for this build and should be added first:

- **Authentication.** Interviews are addressed by an unguessable ObjectId but there are no user accounts. Add auth and check interview ownership in the REST routes and in `interview:join`.
- **Stronger isolation.** Containers share the host kernel. For untrusted public traffic run the sandbox under gVisor (`runsc`) or Firecracker, on worker hosts that hold no secrets.
- **Harness integrity.** Candidate code runs in the same process as the test harness, so a hostile submission could forge its own "returned value" lines. Run the judge in a separate process if scores carry real stakes.
- **Docker socket.** The production compose file mounts the host's Docker socket into the API container, which is equivalent to root on that host. Keep nothing else of value on that server, or move the workers to a dedicated sandbox host.
- **Worker placement.** If the worker itself runs in a container with the Docker socket mounted, `SANDBOX_WORKDIR` must be a path that exists on the Docker host (the compose file handles this).
- **TTS quality.** Voices come from the browser. For production-grade speech, synthesise audio server-side from the same `ai:stream:delta` events.
