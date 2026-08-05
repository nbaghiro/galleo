import type { ZodType } from "zod";
import type { ModelOverrides } from "../models";
import type { ModelTier } from "@model/billing";
import type { ToolId } from "@model/tools";
import type { ArtifactRef, TurnEvent } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { ImageOptions } from "../run";

// injected by the route; may be absent (e.g. generate modal), so tools guard on it
export interface WorkspaceReader {
    find(query?: string): Promise<ArtifactRef[]>; // recent when blank
    read(id: string): Promise<{ ref: ArtifactRef; content: ArtifactContent } | null>;
}

export interface ToolContext {
    artifact?: ArtifactContent;
    image: ImageOptions;
    workspace?: WorkspaceReader;
    signal?: AbortSignal;
    tier?: ModelTier; // threaded to every model call in the turn
    models?: ModelOverrides; // debug: per-task model choice (see ../models.ts)
    maxSections?: number;
    // run a sub-tool with this same context
    use<I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R>;
}

export interface Tool<Input, Result> {
    id: ToolId;
    describe: string; // agent / MCP-facing description
    input: ZodType<Input>;
    run(input: Input, ctx: ToolContext): AsyncGenerator<TurnEvent, Result>;
}

// the id→tool map can't carry each tool's concrete I/R
export type AnyTool = Tool<never, unknown>;

const REGISTRY = new Map<ToolId, AnyTool>();

export function register<I, R>(t: Tool<I, R>): Tool<I, R> {
    REGISTRY.set(t.id, t as AnyTool);
    return t;
}
export function getTool(id: ToolId): AnyTool | undefined {
    return REGISTRY.get(id);
}
export function getTools(ids: readonly ToolId[]): AnyTool[] {
    return ids.map(getTool).filter((t): t is AnyTool => !!t);
}

export function makeContext(base: Omit<ToolContext, "use">): ToolContext {
    const ctx: ToolContext = {
        artifact: base.artifact,
        image: base.image,
        workspace: base.workspace,
        signal: base.signal,
        tier: base.tier,
        models: base.models,
        maxSections: base.maxSections,
        use: <I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R> =>
            tool.run(input, ctx),
    };
    return ctx;
}
