---
name: write-test
description: Write or fix tests for this Sparkus app with createTestApp and inject(). Use when asked to test an endpoint or a service.
---

```ts
import { createTestApp } from "@sparkus/testing";
import { expect, test } from "bun:test";
import { options } from "../app.ts";
import { AppConfig } from "../config.ts";

test("GET /things/:id", async () => {
    const app = await createTestApp({
        ...options,
        overrides: [{ provide: ThingRepository, useValue: fakeRepository }, AppConfig.override({ PAGE_SIZE: 5 })],
    });
    const res = await app.inject({ method: "GET", url: "/things/1" });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ id: 1 });
});
```

- `inject()` runs the full pipeline (routing, guards, validation, errors) in memory. No port.
- Bodies: `body: { ... }` is sent as JSON. Headers: `headers: { authorization: "Bearer ..." }`.
- Always start from `options` of `src/app.ts`: without its providers, tokens fail with SPK1013. Change configuration values with `AppConfig.override({ ... })` (typed, checked, defaults kept).
- Errors are problem+json: assert `res.status` and `res.json().code`.
- Replace slow or external dependencies with `overrides`, never real network calls.
- Run `bun test`.
