# Working on Sparkus

Instructions for anyone, human or agent, changing this repository. Read [ROADMAP.md](./ROADMAP.md) first: its decisions table (D1 to D10) is binding.

## The mission

1. **The fastest decorator + DI framework.** Every change to the request path must be measured, not guessed.
2. **The easiest to write for AI agents.** Predictable API, typed everything, errors that say how to fix them.
3. **Zero runtime dependencies (D9).** Never add a dependency to a published package. Dev dependencies are fine.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Decorators, DI (`di.ts`), route compilation (`compile.ts`), pipeline (`pipeline.ts`), router (`router.ts`), errors, web context (`web.ts`), app (`app.ts`). |
| `packages/engine-bun` | `Bun.serve` native routes; misses fall back to the core router. |
| `packages/engine-node` | `node:http` + core router. |
| `packages/sparkus` | Public package: re-exports core, picks the engine. |
| `packages/testing` | `createTestApp`, in-memory `inject()`. |
| `packages/cli` | `sparkus` command. |
| `tests/conformance` | One fixture app (`src/fixture.ts`) and one suite run on every engine. |
| `bench/` | Benchmark harness. `spike/` is the phase 0 prototype, kept only as a bench baseline. |

## Commands

```bash
bun run test
```

Builds with `tsc -b`, then runs every test. The conformance suite spawns a real Node process: set `NODE_BIN` to a Node 22+ binary if `node` on the PATH is older.

```bash
bun run typecheck
```

```bash
bun run check:deps
```

```bash
bun run bench
```

## Rules

- **Behavior lives in the conformance suite.** A change in what a request returns gets a case in `tests/conformance/test/conformance.test.ts`, which runs on all four targets. Engines must never differ.
- **Hot path discipline.** Anything per request in `engine-*/src`, `core/src/web.ts`, `router.ts` or `pipeline.ts`: no closures or allocations that can be hoisted to startup, no `await` on synchronous values, no try/catch-free throw paths for expected cases, monomorphic objects (same fields, same order, set in the constructor).
- **Prove performance claims.** Before/after numbers from `bench/` (same machine, same session, `--runs` ≥ 3 for close calls), plus CPU per request. A micro-benchmark alone is not proof. Only one benchmark may run at a time on a machine: `bench/run.ts` takes a machine-wide lock, do not bypass it.
- **Errors.** Startup errors are `SparkusError` with a code from `ErrorCode` in `core/src/errors.ts`, a message that names the culprit and the fix. Request errors are `HttpError`, rendered as problem+json. Never send a stack trace.
- **Style.** TypeScript strict, `noUncheckedIndexedAccess`, 4 spaces, 120 columns, ESM with `.js` import suffixes, `import type` for types. Comments explain why, not what.
