import { describe, expect, it } from "vitest";
import { record, recordTokens, tracing, withMeter, withStep } from "../meter";

const FLASH = "google:gemini-3.5-flash";

describe("tracing flag", () => {
    it("is off unless a run asks for it, so normal turns stay billing-only", async () => {
        await withMeter(async () => {
            expect(tracing()).toBe(false);
        });
        await withMeter(async () => {
            expect(tracing()).toBe(true);
        }, true);
    });

    it("reads false outside any meter rather than throwing", () => {
        expect(tracing()).toBe(false);
    });
});

describe("step attribution", () => {
    it("labels the calls made inside it", async () => {
        const meter = await withMeter(async (m) => {
            await withStep("outline", async () => recordTokens(FLASH, 10, 5));
            await withStep("section:b3", async () => recordTokens(FLASH, 20, 8));
            return m;
        }, true);
        expect(meter.uses.map((u) => u.step)).toEqual(["outline", "section:b3"]);
    });

    it("leaves calls made outside a step unlabelled rather than guessing", async () => {
        const meter = await withMeter(async (m) => {
            recordTokens(FLASH, 1, 1);
            return m;
        }, true);
        expect(meter.uses[0]!.step).toBe("");
    });

    it("keeps concurrent steps from overwriting each other's label", async () => {
        const meter = await withMeter(async (m) => {
            await Promise.all([
                withStep("section:a", async () => {
                    await new Promise((r) => setTimeout(r, 5));
                    recordTokens(FLASH, 1, 1);
                }),
                withStep("section:b", async () => recordTokens(FLASH, 2, 2)),
            ]);
            return m;
        }, true);
        // b finishes first, so order is by completion; the labels must still match their own call
        expect(meter.uses.find((u) => u.input === 1)!.step).toBe("section:a");
        expect(meter.uses.find((u) => u.input === 2)!.step).toBe("section:b");
    });
});

describe("spans", () => {
    it("carries the prompt bodies a trace is for", async () => {
        const meter = await withMeter(async (m) => {
            await withStep("outline", async () =>
                record({
                    modelId: FLASH,
                    input: 100,
                    output: 50,
                    step: "",
                    ms: 1200,
                    system: "You are a planner.",
                    prompt: "Plan a deck about widgets.",
                    response: '{"beats":[]}',
                    temperature: 0.9,
                    finishReason: "stop",
                }),
            );
            return m;
        }, true);
        const span = meter.uses[0]!;
        expect(span.step).toBe("outline"); // filled in from the scope, not the caller
        expect(span.system).toBe("You are a planner.");
        expect(span.ms).toBe(1200);
    });

    it("is still a TokenUse, so billing reads it unchanged", async () => {
        const meter = await withMeter(async (m) => {
            record({ modelId: FLASH, input: 7, output: 3, step: "outline", ms: 5 });
            return m;
        }, true);
        expect(meter.uses[0]).toMatchObject({ modelId: FLASH, input: 7, output: 3 });
    });

    it("drops a call that used no tokens, traced or not", async () => {
        const meter = await withMeter(async (m) => {
            record({ modelId: FLASH, input: 0, output: 0, step: "outline", ms: 5 });
            return m;
        }, true);
        expect(meter.uses).toHaveLength(0);
    });
});
