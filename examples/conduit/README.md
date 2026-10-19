# Conduit on Sparkus

The [RealWorld](https://realworld-docs.netlify.app) "Conduit" API (users, JWT auth, profiles, articles, comments, favorites, tags), built on Sparkus as a test bench for the framework: does a real app fit, what does it cost per request, what is missing.

It was written by an agent that only had what a user gets (the `sparkus init` scaffold, `llms.txt`, `docs/errors.md`), never the framework sources. Its notes, kept while building: [FRICTION.md](./FRICTION.md).

- In memory, no database. JWT HS256 and scrypt with `node:crypto`. Runs on Bun and Node.
- 19 routes, one feature per folder under `src/`, 32 tests, a generated typed client (`src/client.ts`) driven in a test.
- RealWorld error bodies (422 for validation, an `errors` field) through `onError`, on top of problem+json.
- `CONDUIT_SEED=N` seeds 10 users (`user0@conduit.test` … `user9`, password `password`) and N articles at startup.

```bash
bun test
```

```bash
CONDUIT_SEED=100 bun src/main.ts
```

## Load test

```bash
bun load/run.ts
```

Starts the app on Bun (sources) and on Node (bundle made with the `sparkus build` plugin, `sparkus` left external), seeded with 1000 articles, and measures 13 routes with autocannon: throughput, p99, and requests per CPU second of the server. It takes the repo bench's machine lock and CPU pinning (`bench/system.ts`). Options: `--runtimes bun,node`, `--scenarios a,b`, `--rounds 3`, `--duration 8`, `--env LOG_LEVEL=warn`, `--label name`. `NODE_BIN` picks Node.

`--profile` runs each route once under `--cpu-prof` and splits the server's CPU between Sparkus (core, engine), the app and the runtime. Results go to `load/results/` and `load/profiles/` (not versioned).

## First results (2026-10-20)

Windows 11, server pinned to one physical core, 3 rounds × 8 s, 100 connections, seed 1000, Bun 1.4.3, **Node 20.17** (below the supported 22: the only one on the machine; to redo on 22/24). The app runs with the template's production options (request logs, security headers, request id, health, timeout). Medians, requests per second:

| Route | Response | Bun | Node | Bun, no request logs | Node, no request logs |
|---|---:|---:|---:|---:|---:|
| `GET /api/tags` | 80 B | 66 426 | 42 464 | 74 360 | 47 224 |
| `GET /api/articles/:slug` | 1.3 KB | 64 800 | 35 176 | 70 400 | 38 844 |
| same, with a token | 1.3 KB | 53 228 | 21 668 | 57 464 | 23 050 |
| `GET /api/articles?limit=20` | 6.2 KB | 47 868 | 20 620 | 50 308 | 22 088 |
| same, with a token | 6.2 KB | 39 176 | 14 884 | 41 576 | 15 534 |
| `GET /api/articles?tag=…` | 6.2 KB | 19 804 | 15 389 | 20 524 | 16 304 |
| `GET /api/articles/feed` | 6.2 KB | 33 472 | 13 325 | 36 072 | 13 789 |
| `GET /api/articles/:slug/comments` | 0.6 KB | 64 580 | 36 204 | 70 824 | 40 236 |
| `GET /api/profiles/:username` (token) | 73 B | 55 132 | 24 110 | 59 736 | 25 872 |
| `GET /api/user` (token) | 232 B | 50 588 | 18 322 | 54 868 | 19 700 |
| `POST /api/articles/:slug/comments` | 201 B | 40 424 | 16 604 | 43 432 | 18 030 |
| `POST /api/articles`, invalid body (422) | 347 B | 39 196 | 12 495 | 41 984 | 13 684 |
| `GET /api/user` without a token (401) | 164 B | 61 388 | 25 984 | 66 160 | 29 012 |

The two runs are separate sessions: the "no request logs" columns (`LOG_LEVEL=warn`) are indicative, not paired.

What the profiles say:

- **Sparkus' own code is not the bottleneck of this app.** The server's time goes to JSON serialization and socket writes (runtime: `writev` alone is 27 to 34 % of Node's CPU), the app's own JWT HMAC (about 10 to 15 % on authenticated routes) and its in-memory filters (`?tag=` is 73 % app code).
- **A token costs 18 % under Bun and 38 % under Node** (`/api/articles/:slug` with and without). Most of it is the app's HMAC, not the guard pipeline.
- **Request logs cost 5 to 11 %**, in line with the phase 3 measurements. Under Bun the observed path shows up in the profiles (`ctx.path` reading `request.url`, `method`, `logRequest`): the first place to look for a framework-side gain.
- **The error path is the slowest route under Node.** `onError` can only add a field by building a second `HttpError`, and an `Error` is constructed on each 401/422.
- **Node is 2 to 3 × slower than Bun here**, a much larger gap than the bench's micro scenarios (where both engines are within 1 to 6 % of their raw server). Partly Node 20; to remeasure on 22 and 24 before drawing conclusions.
- Peak memory 200 to 250 MiB, all of it the comments that `POST …/comments` piles up during the run (60 to 80 MiB without it).

What building it found: [FRICTION.md](./FRICTION.md), top 10 at the end.
