import { afterEach, describe, expect, it } from "vitest";
import type { ModelCall, ToolSpan } from "@model/trace";
import { modelCalls, toolSpans } from "@model/trace";
import { record, withMeter, withStep } from "@services/core/ai/meter";
import {
    flushTraces,
    memoryTraceStore,
    noteCredits,
    setTraceStore,
    traceCall,
    traceUse,
} from "@services/core/traces";

const FLASH = "google:gemini-3.5-flash";
const principal = { userId: "u1", ws: { id: "ws1" } };
const root = (tool: "show-sections" | "add-section" = "show-sections") => ({
    tool,
    surface: "direct" as const,
    principal,
    models: { outline: FLASH },
});
const call = (over: Partial<ModelCall> = {}): Parameters<typeof record>[0] => ({
    modelId: FLASH,
    input: 100,
    output: 20,
    step: "",
    ms: 40,
    system: "sys",
    prompt: "ask",
    response: "answer",
    ...over,
});

afterEach(() => {
    setTraceStore(null);
});

describe("a root call", () => {
    it("records who ran what, the outcome, the models, and the settled credits", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        const out = await traceCall(root(), async (span) => {
            span.note({ input: { hello: 1 }, generationId: "g1", artifactId: "a1" });
            noteCredits(3);
            span.end("ok");
            return span.traceId;
        });
        await flushTraces();
        const [t] = store.traces;
        expect(t).toMatchObject({
            id: out,
            workspaceId: "ws1",
            userId: "u1",
            tool: "show-sections",
            surface: "direct",
            generationId: "g1",
            artifactId: "a1",
            status: "ok",
            error: null,
            credits: 3,
            models: { outline: FLASH },
        });
        expect(toolSpans(t!.spans)).toHaveLength(1);
        expect(t!.spans[0]).toMatchObject({ kind: "tool", parent: null, status: "ok" });
    });

    it("hands back no trace id when nothing will keep the trace", async () => {
        const id = await traceCall(root(), async (span) => span.traceId);
        expect(id).toBeNull();
    });

    it("keeps a refusal as its own status, with the reason as the error", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await traceCall(root(), async (span) => span.end("refused", "credits"));
        await flushTraces();
        expect(store.traces[0]).toMatchObject({ status: "refused", error: "credits" });
    });

    it("records a throw as an error and an abort as an abort, then rethrows", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await expect(
            traceCall(root(), async () => {
                throw new Error("provider down");
            }),
        ).rejects.toThrow("provider down");
        await expect(
            traceCall(root(), async () => {
                throw new Error("The operation was aborted");
            }),
        ).rejects.toThrow();
        await flushTraces();
        expect(store.traces.map((t) => t.status)).toEqual(["error", "aborted"]);
        expect(store.traces[0]!.error).toBe("provider down");
    });
});

describe("the level", () => {
    it("strips the bodies, the input and the content at metrics", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await traceCall(root(), async (span) => {
            span.note({
                input: { prompt: "secret" },
                content: { format: "deck", theme: "studio", sections: [] },
            });
            record(call());
            span.end("ok");
        });
        await flushTraces();
        const t = store.traces[0]!;
        expect(t.level).toBe("metrics");
        expect(t.input).toBeNull();
        expect(t.content).toBeNull();
        const [m] = modelCalls(t.spans);
        expect(m).toMatchObject({ modelId: FLASH, input: 100, output: 20, ms: 40 });
        expect(m).not.toHaveProperty("prompt");
        expect(m).not.toHaveProperty("system");
        expect(m).not.toHaveProperty("response");
        expect(t.tokensIn).toBe(100);
        expect(t.tokensOut).toBe(20);
    });

    it("keeps everything for a principal the store marks as full", async () => {
        const store = memoryTraceStore({ full: true });
        setTraceStore(store);
        await traceCall(root(), async (span) => {
            span.note({ input: { prompt: "kept" } });
            record(call());
            span.end("ok");
        });
        await flushTraces();
        const t = store.traces[0]!;
        expect(t.level).toBe("full");
        expect(t.input).toEqual({ prompt: "kept" });
        expect(modelCalls(t.spans)[0]).toMatchObject({ prompt: "ask", response: "answer" });
    });

    it("keeps everything for a call that failed, so a failure can be read afterwards", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await traceCall(root(), async (span) => {
            span.note({ input: { prompt: "why" } });
            record(call());
            span.end("refused", "bad-input");
        });
        await flushTraces();
        expect(store.traces[0]).toMatchObject({ level: "full", input: { prompt: "why" } });
    });
});

describe("nesting", () => {
    it("makes a call inside a call a child span, with its model calls under it", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await traceCall(root("add-section"), async (outer) => {
            record(call({ step: "outer" }));
            await traceCall(
                { tool: "write-section", surface: "agent", principal, models: {} },
                async (inner) => {
                    record(call({ step: "inner" }));
                    inner.end("ok");
                },
            );
            outer.end("ok");
        });
        await flushTraces();
        expect(store.traces).toHaveLength(1);
        const t = store.traces[0]!;
        const tools = toolSpans(t.spans);
        expect(tools.map((s) => s.tool)).toEqual(["add-section", "write-section"]);
        expect(tools[1]!.parent).toBe(t.id);
        const calls = modelCalls(t.spans);
        expect(calls.find((c) => c.step === "outer")!.parent).toBe(t.id);
        expect(calls.find((c) => c.step === "inner")!.parent).toBe(tools[1]!.id);
        expect(t.tokensIn).toBe(200);
    });

    it("counts the patches a span made, never the ops", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        await traceCall(root(), async (span) => {
            span.patched({ artifact: [{ op: "removeSection", id: "s1" }] });
            span.patched({
                generation: [{ op: "setSteer", note: "x" }],
                workspace: { kind: "rename", id: "a", title: "t" },
            });
            span.end("ok");
        });
        await flushTraces();
        expect((store.traces[0]!.spans[0] as ToolSpan).patches).toEqual({
            artifact: 1,
            generation: 1,
            workspace: true,
        });
    });

    it("runs a sub-tool through ctx.use as a child span that every step of it lands under", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        async function* body(): AsyncGenerator<string, number> {
            yield "first";
            await withStep("section:b1", async () => record(call({ step: "" })));
            yield "second";
            return 2;
        }
        await traceCall(root("add-section"), async (span) => {
            const gen = traceUse("write-section", body);
            const seen: string[] = [];
            let step = await gen.next();
            while (!step.done) {
                seen.push(step.value);
                step = await gen.next();
            }
            expect(seen).toEqual(["first", "second"]);
            expect(step.value).toBe(2);
            span.end("ok");
        });
        await flushTraces();
        const t = store.traces[0]!;
        const child = toolSpans(t.spans)[1]!;
        expect(child).toMatchObject({ tool: "write-section", surface: "internal", status: "ok" });
        expect(modelCalls(t.spans)[0]!.parent).toBe(child.id);
    });

    it("bills through the meter and records on the trace independently", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        const uses = await traceCall(root(), async (span) => {
            const m = await withMeter(async (meter) => {
                record(call());
                return meter.uses;
            });
            span.end("ok");
            return m;
        });
        await flushTraces();
        expect(uses).toHaveLength(1);
        expect(modelCalls(store.traces[0]!.spans)).toHaveLength(1);
    });
});
