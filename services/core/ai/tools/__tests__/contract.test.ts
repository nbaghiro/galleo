import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { TurnEvent } from "@model/ai";
import { TOOL_SPEC, TOOLS } from "@model/tools";
import {
    getTool,
    getTools,
    implement,
    makeContext,
    toolsFor,
    type Tool,
    type ToolContext,
    type WorkspaceReader,
} from "../../tools";

// imports only the contract (not the tool modules), so the registry starts empty

async function drain<R>(gen: AsyncGenerator<TurnEvent, R>): Promise<R> {
    let step: IteratorResult<TurnEvent, R> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

const echo = implement("show-sections", async function* (_input, ctx) {
    return ctx.artifact?.sections ?? [];
});

describe("implement", () => {
    it("takes describe and input from the definition rather than the call site", () => {
        expect(echo.describe).toBe(TOOL_SPEC["show-sections"].describe);
        expect(echo.input).toBe(TOOL_SPEC["show-sections"].input);
    });

    it("refuses a proposal, which has no server body by definition", () => {
        expect(() =>
            implement("revise-outline", async function* () {
                return null;
            }),
        ).toThrow(/proposal/);
    });

    it("lets an internal primitive skip the agent schema, since nothing calls it by name", () => {
        expect(() =>
            implement("pick-arc", async function* () {
                return null;
            }),
        ).not.toThrow();
    });
});

describe("getTool / getTools", () => {
    it("finds an implemented id and returns undefined for one that is only defined", () => {
        expect(getTool("show-sections")).toBe(echo);
        expect(getTool("plan-outline")).toBeUndefined();
    });

    it("maps ids to tools and drops the ones with no implementation", () => {
        expect(getTools(["show-sections", "plan-outline", "show-sections"])).toEqual([echo, echo]);
        expect(getTools(["plan-outline", "write-section"])).toEqual([]);
    });
});

describe("toolsFor", () => {
    it("offers a tool only on the surfaces its definition names", () => {
        const surfaces = TOOLS["show-sections"].surfaces;
        for (const s of surfaces) expect(toolsFor(s)).toContain(echo);
        const withheld = (["agent", "direct", "mcp", "internal"] as const).filter(
            (s) => !surfaces.includes(s),
        );
        for (const s of withheld) expect(toolsFor(s)).not.toContain(echo);
    });
});

describe("makeContext", () => {
    it("copies base fields and wires `use` to run a sub-tool with this SAME context", async () => {
        const workspace: WorkspaceReader = { find: async () => [], read: async () => null };
        const signal = new AbortController().signal;
        const image = { source: "ai" as const };
        const ctx = makeContext({ image, workspace, signal });

        const probe: Tool<null, ToolContext> = {
            id: "apply-patch",
            describe: "echo ctx",
            input: z.null(),
            async *run(_input, c): AsyncGenerator<TurnEvent, ToolContext> {
                return c;
            },
        };

        const seen = await drain(ctx.use(probe, null));
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
