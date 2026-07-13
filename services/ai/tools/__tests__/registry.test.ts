import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { TurnEvent } from "@model/ai";
import {
    register,
    getTool,
    getTools,
    makeContext,
    type Tool,
    type ToolContext,
    type WorkspaceReader,
} from "../registry";

// The tool registry — register / lookup / context wiring. Pure map + closure logic, no DB. This file imports
// ONLY the registry (not the tool modules), so REGISTRY starts empty and these fixtures own it cleanly.

async function drain<R>(gen: AsyncGenerator<TurnEvent, R>): Promise<R> {
    let step: IteratorResult<TurnEvent, R> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

// A tiny fixture tool. Its id is a real ToolId literal (the registry keys on ToolId), which is safe because
// nothing else registers in this isolated test file.
const doubler: Tool<{ x: number }, number> = {
    id: "check-section",
    describe: "double x",
    input: z.object({ x: z.number() }),
    async *run(input): AsyncGenerator<TurnEvent, number> {
        return input.x * 2;
    },
};

describe("register / getTool", () => {
    it("register returns the same tool it stored", () => {
        expect(register(doubler)).toBe(doubler);
    });

    it("getTool finds a registered id, returns undefined for an unregistered one", () => {
        register(doubler);
        expect(getTool("check-section")).toBe(doubler);
        expect(getTool("pick-arc")).toBeUndefined();
    });
});

describe("getTools", () => {
    it("maps ids to tools and drops the unknown ones", () => {
        register(doubler);
        const found = getTools(["check-section", "pick-arc", "check-section"]);
        expect(found).toEqual([doubler, doubler]);
    });

    it("returns an empty array when nothing matches", () => {
        expect(getTools(["plan-outline", "write-section"])).toEqual([]);
    });
});

describe("makeContext", () => {
    it("copies base fields and wires `use` to run a sub-tool with this SAME context", async () => {
        const workspace: WorkspaceReader = {
            find: async () => [],
            read: async () => null,
        };
        const signal = new AbortController().signal;
        const image = { source: "ai" as const };
        const ctx = makeContext({ image, workspace, signal });

        // A probe sub-tool returns whatever context it was run with.
        const probe: Tool<null, ToolContext> = {
            id: "apply-patch",
            describe: "echo ctx",
            input: z.null(),
            async *run(_input, c): AsyncGenerator<TurnEvent, ToolContext> {
                return c;
            },
        };

        const seen = await drain(ctx.use(probe, null));
        // `use` forwards the same context object — sharing image / workspace / signal by reference.
        expect(seen).toBe(ctx);
        expect(seen.image).toBe(image);
        expect(seen.workspace).toBe(workspace);
        expect(seen.signal).toBe(signal);
    });

    it("carries through a bare context (no workspace / signal)", () => {
        const ctx = makeContext({ image: {} });
        expect(ctx.workspace).toBeUndefined();
        expect(ctx.signal).toBeUndefined();
        expect(typeof ctx.use).toBe("function");
    });
});
