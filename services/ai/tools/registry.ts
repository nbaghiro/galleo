import type { ZodType } from "zod";
import type { ToolId } from "@model/tools";
import type { TurnEvent } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { ImageOptions } from "../run";

// The executable side of the tool catalog (@model/tools). A Tool binds a ToolId to an input schema + a `run`
// that yields progress (TurnEvents) and RETURNS a typed result. That return value is the key: it lets a
// composite tool build on smaller ones via `ctx.use(subTool, input)` + `yield*` (forward the sub-tool's
// progress, capture its result). The three surfaces — direct dispatch, the chat agent, and MCP — all read
// tools from this one registry; none of them redefines a capability.

export interface ToolContext {
    artifact?: ArtifactContent; // the open artifact (edit / section tools need it)
    image: ImageOptions; // how images resolve (stock vs ai)
    signal?: AbortSignal;
    // Run another tool with this same context — forwards its events (used via `yield*`) + returns its result.
    use<I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R>;
}

export interface Tool<Input, Result> {
    id: ToolId;
    describe: string; // agent / MCP-facing description
    input: ZodType<Input>;
    run(input: Input, ctx: ToolContext): AsyncGenerator<TurnEvent, Result>;
}

// A heterogeneous handle for registry storage — the id→tool map can't carry each tool's concrete I/R.
export type AnyTool = Tool<never, unknown>;

const REGISTRY = new Map<ToolId, AnyTool>();

export function register<I, R>(t: Tool<I, R>): Tool<I, R> {
    REGISTRY.set(t.id, t as unknown as AnyTool);
    return t;
}
export function getTool(id: ToolId): AnyTool | undefined {
    return REGISTRY.get(id);
}
export function getTools(ids: readonly ToolId[]): AnyTool[] {
    return ids.map(getTool).filter((t): t is AnyTool => !!t);
}

// Build a ToolContext whose `use` runs sub-tools with this same context, so a composite shares the artifact,
// image strategy, and abort signal with everything it composes.
export function makeContext(base: Omit<ToolContext, "use">): ToolContext {
    const ctx: ToolContext = {
        artifact: base.artifact,
        image: base.image,
        signal: base.signal,
        use: <I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R> =>
            tool.run(input, ctx),
    };
    return ctx;
}
