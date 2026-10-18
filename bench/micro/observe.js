// What the observed request path spends its time on, in process: request id generation,
// Response construction with extra headers, request log line serialization.
//
//     bun with-lock.ts -- bun micro/observe.js
if (process.env.SPARKUS_BENCH_LOCK_OWNER === undefined) {
    console.error("Run it under the machine-wide bench lock: bun bench/with-lock.ts -- bun " + process.argv[1]);
    process.exit(2);
}

function bench(name, fn, n = 2_000_000) {
    for (let i = 0; i < n / 10; i++) fn(i);
    const start = performance.now();
    let sink;
    for (let i = 0; i < n; i++) sink = fn(i);
    const ns = ((performance.now() - start) * 1e6) / n;
    console.log(`${name.padEnd(48)} ${ns.toFixed(1).padStart(7)} ns`);
    return sink;
}

const SECURITY = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=15552000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
};
const body = { hello: "world" };

bench("crypto.randomUUID()", () => crypto.randomUUID());
const prefix = Math.random().toString(36).slice(2, 10);
let counter = 0;
bench("prefix + counter (base 36)", () => prefix + "-" + (++counter).toString(36));

bench("Response.json(body)", () => Response.json(body));
bench("Response.json(body, { headers: 1 })", () => Response.json(body, { status: 200, headers: { vary: "origin" } }));
bench("Response.json(body, { headers: copy of 7 })", () => Response.json(body, { status: 200, headers: { ...SECURITY } }));
const shared = { status: 200, headers: SECURITY };
bench("Response.json(body, shared init of 7)", () => Response.json(body, shared));
const prebuilt = new Headers(SECURITY);
bench("Response.json(body, { headers: Headers copy })", () => Response.json(body, { status: 200, headers: new Headers(prebuilt) }));
bench("{ ...7 headers } alone", () => ({ ...SECURITY }));

const request = new Request("http://localhost/users/42?x=1", { headers: { "user-agent": "a" } });
bench("request.headers.get(missing)", () => request.headers.get("origin"));

const path = "/users/42";
bench("generic fields JSON (7 fields)", () => {
    const fields = { reqId: "abc-1", method: "GET", path, route: "/users/:id", status: 200, ms: 0.42 };
    let out = "";
    for (const key in fields) out += `,${JSON.stringify(key)}:${JSON.stringify(fields[key])}`;
    return `{"level":"info","time":${Date.now()},"module":"http","msg":${JSON.stringify(`GET ${path} 200`)}${out}}`;
});
const routeJson = JSON.stringify("/users/:id");
bench("specialized request line", () => {
    const p = JSON.stringify(path);
    const inner = p.slice(1, -1);
    return `{"level":"info","time":${Date.now()},"module":"http","msg":"GET ${inner} 200","reqId":"abc-1","method":"GET","path":${p},"route":${routeJson},"status":200,"ms":0.42}`;
});
bench("performance.now()", () => performance.now());
bench("Date.now()", () => Date.now());

console.log("--- variants");
bench("Headers copy + 1 set, init without status", () => {
    const h = new Headers(prebuilt);
    h.set("x-request-id", "abc-1");
    return Response.json(body, { headers: h });
});
bench("Response.json(body) then 7 headers.set()", () => {
    const r = Response.json(body);
    for (const k in SECURITY) r.headers.set(k, SECURITY[k]);
    return r;
});
bench("new Headers(object of 7)", () => new Headers(SECURITY));
bench("new Headers(prebuilt)", () => new Headers(prebuilt));
const entries = Object.entries(SECURITY);
bench("new Headers(entries array)", () => new Headers(entries));
bench("Response.json(body, { headers: entries array })", () => Response.json(body, { headers: entries }));
