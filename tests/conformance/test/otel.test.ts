// The telemetry option against the real OpenTelemetry SDK: Sparkus depends on none of it (D9),
// its types are structural. This file proves @opentelemetry/api objects fit as they are.
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span as OtelSpan } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Controller, Get, createApp, type Ctx, type SparkusApp } from "sparkus";

const spans = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
const metricsOut = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter: metricsOut, exportIntervalMillis: 3_600_000 });
const meterProvider = new MeterProvider({ readers: [reader] });
const db = tracerProvider.getTracer("db");

@Controller("/orders")
class OrderController {
    @Get("/:id")
    async get(ctx: Ctx) {
        // A span started by app code becomes a child of the request's span, across an await.
        await Bun.sleep(1);
        const query = db.startSpan("SELECT orders");
        query.end();
        return { id: ctx.params.id };
    }

    @Get("/fail/now")
    fail(): never {
        throw new Error("database down");
    }
}

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_ID = "00f067aa0ba902b7";

for (const engine of ["memory", "bun", "node"] as const) {
    describe(`OpenTelemetry SDK, ${engine}`, () => {
        let app: SparkusApp;
        let base = "http://sparkus.test";

        beforeAll(async () => {
            context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
            propagation.setGlobalPropagator(new W3CTraceContextPropagator());
            app = createApp({
                controllers: [OrderController],
                logger: false,
                engine: engine === "memory" ? "auto" : engine,
                telemetry: {
                    tracer: tracerProvider.getTracer("api"),
                    meter: meterProvider.getMeter("api"),
                    extract: (ctx) => propagation.extract(ROOT_CONTEXT, { traceparent: ctx.header("traceparent") }),
                    activate: (span: OtelSpan, run) => context.with(trace.setSpan(context.active(), span), run),
                },
            });
            if (engine === "memory") await app.init();
            else base = (await app.listen({ port: 0, hostname: "127.0.0.1", signals: false })).url.replace("localhost", "127.0.0.1");
        });
        afterAll(async () => {
            await app.close();
            context.disable();
            propagation.disable();
        });

        const request = (path: string, headers: Record<string, string> = {}) =>
            engine === "memory" ? app.fetch(new Request(base + path, { headers })) : fetch(base + path, { headers });

        test("server span named after the route, child of the incoming traceparent, parent of app spans", async () => {
            spans.reset();
            const res = await request("/orders/42", { traceparent: `00-${TRACE_ID}-${PARENT_ID}-01` });
            expect(res.status).toBe(200);
            const finished = spans.getFinishedSpans();
            const server = finished.find((span) => span.name === "GET /orders/:id")!;
            const query = finished.find((span) => span.name === "SELECT orders")!;
            expect(server.kind).toBe(SpanKind.SERVER);
            expect(server.spanContext().traceId).toBe(TRACE_ID);
            expect(server.parentSpanContext?.spanId).toBe(PARENT_ID);
            expect(server.attributes).toMatchObject({
                "http.request.method": "GET",
                "http.route": "/orders/:id",
                "url.path": "/orders/42",
                "http.response.status_code": 200,
            });
            expect(query.spanContext().traceId).toBe(TRACE_ID);
            expect(query.parentSpanContext?.spanId).toBe(server.spanContext().spanId);
        });

        test("a 500 is an error span with the exception event", async () => {
            spans.reset();
            expect((await request("/orders/fail/now")).status).toBe(500);
            const server = spans.getFinishedSpans().find((span) => span.name === "GET /orders/fail/now")!;
            expect(server.status.code).toBe(SpanStatusCode.ERROR);
            expect(server.events.map((event) => event.name)).toEqual(["exception"]);
            expect(server.events[0]!.attributes?.["exception.message"]).toBe("database down");
        });

        test("http.server.request.duration histogram, in seconds", async () => {
            await request("/orders/7");
            await reader.forceFlush();
            const metric = metricsOut
                .getMetrics()
                .flatMap((resource) => resource.scopeMetrics)
                .flatMap((scope) => scope.metrics)
                .find((m) => m.descriptor.name === "http.server.request.duration")!;
            expect(metric.descriptor.unit).toBe("s");
            const point = metric.dataPoints.find((p) => p.attributes["http.route"] === "/orders/:id")!;
            expect(point.attributes).toMatchObject({ "http.request.method": "GET", "http.response.status_code": 200 });
            expect((point.value as { count: number }).count).toBeGreaterThan(0);
        });
    });
}
