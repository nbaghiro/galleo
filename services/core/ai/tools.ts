import { z, type ZodType } from "zod";
import type { ToolId, ToolSurface } from "@model/tools";
import type { ToolInput } from "@model/tools";
import type { ToolSpec } from "@model/tools";
import { TOOL_SPEC, TOOLS } from "@model/tools";
import type { ModelOverrides } from "@services/core/models";
import type { ModelTier } from "@model/billing";
import type { ArtifactRef, Patch, TurnEvent } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { ImageOptions } from "./images";

// The run half of a tool. Its identity, description, input schema and price all live in
// @model/tools; this module only supplies the body and refuses one that has no definition.

// injected by the route; may be absent (e.g. the generate modal), so tools guard on it
export interface WorkspaceReader {
    find(query?: string): Promise<ArtifactRef[]>; // recent when blank
    read(id: string): Promise<{ ref: ArtifactRef; content: ArtifactContent } | null>;
}

/** Account-level reach, for the one tool that is about the person rather than one workspace. */
export interface AccountReader {
    workspaces(): Promise<{ id: string; name: string; role: string; isDefault: boolean }[]>;
}

export interface ToolContext {
    artifact?: ArtifactContent;
    image: ImageOptions;
    workspace?: WorkspaceReader;
    account?: AccountReader;
    signal?: AbortSignal;
    tier?: ModelTier; // threaded to every model call in the turn
    models?: ModelOverrides; // per-step model choice (see ../models.ts)
    maxSections?: number;
    // retrieval over the request's attached contexts; absent when none are attached
    pack?: (query: string) => Promise<string | null>;
    // run a sub-tool with this same context
    use<I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R>;
}

export interface Tool<Input, Result> {
    id: ToolId;
    describe: string;
    input: ZodType<Input>;
    run(input: Input, ctx: ToolContext): AsyncGenerator<TurnEvent, Result>;
    // How this tool's result changes an artifact. The one definition of that mapping: the chat agent
    // reads it to build a proposal card, and the effect path reads it to apply the change. A tool
    // that changes nothing (every read tool) leaves it absent.
    //
    // Erased rather than `(result: Result, input: Input)` because both would sit in parameter
    // position, and the registry holds every tool as `Tool<never, unknown>`. `implement` takes the
    // typed mapper and narrows here, so authoring stays checked and only storage is loose.
    patch?: (result: unknown, input: unknown) => Patch;
}

// the id→tool map can't carry each tool's concrete I/R
type AnyTool = Tool<never, unknown>;

const REGISTRY = new Map<ToolId, AnyTool>();

/**
 * Register the body of a tool that @model/tools already defines. Throws at import rather than at
 * call time, so a definition and its implementation cannot drift apart unnoticed.
 */
export function implement<Id extends ToolId, R>(
    id: Id,
    run: (input: ToolInput<Id>, ctx: ToolContext) => AsyncGenerator<TurnEvent, R>,
    patch?: (result: R, input: ToolInput<Id>) => Patch,
): Tool<ToolInput<Id>, R> {
    const def = TOOLS[id];
    if (!def) throw new Error(`tool "${id}" has no definition in @model/tools`);
    if (def.kind === "proposal")
        throw new Error(`tool "${id}" is a proposal and has no server body`);
    const found = (TOOL_SPEC as Partial<Record<ToolId, ToolSpec>>)[id];
    // an internal primitive is only ever reached through ctx.use with a typed object, so it needs no
    // agent-facing schema; anything an agent or MCP client can call does
    const reachable = def.surfaces.some((s) => s !== "internal");
    if (!found && reachable) throw new Error(`tool "${id}" has no describe/input in TOOL_SPEC`);
    const tool: Tool<ToolInput<Id>, R> = {
        id,
        describe: found?.describe ?? def.summary,
        input: (found?.input ?? z.unknown()) as ZodType<ToolInput<Id>>,
        run,
        patch:
            patch &&
            ((result: unknown, input: unknown) => patch(result as R, input as ToolInput<Id>)),
    };
    REGISTRY.set(id, tool as AnyTool);
    return tool;
}

/** A tool's agent-facing contract, with its schema's exact type kept so callers can infer from it. */
export function spec<Id extends keyof typeof TOOL_SPEC>(id: Id): (typeof TOOL_SPEC)[Id] {
    return TOOL_SPEC[id];
}

export function getTool(id: ToolId): AnyTool | undefined {
    return REGISTRY.get(id);
}
export function getTools(ids: readonly ToolId[]): AnyTool[] {
    return ids.map(getTool).filter((t): t is AnyTool => !!t);
}

/** Every implemented tool the definition exposes on this surface. */
export function toolsFor(surface: ToolSurface): AnyTool[] {
    return [...REGISTRY.values()].filter((t) => TOOLS[t.id].surfaces.includes(surface));
}

/** Every tool that has a body at all, which is the set that can spend money. */
export function registeredToolIds(): ToolId[] {
    return [...REGISTRY.keys()];
}

export function makeContext(base: Omit<ToolContext, "use">): ToolContext {
    const ctx: ToolContext = {
        artifact: base.artifact,
        image: base.image,
        workspace: base.workspace,
        account: base.account,
        signal: base.signal,
        tier: base.tier,
        models: base.models,
        maxSections: base.maxSections,
        pack: base.pack,
        use: <I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R> =>
            tool.run(input, ctx),
    };
    return ctx;
}

/** Run a tool to completion and take its value, discarding the events it yields on the way. */
export async function drain<R>(gen: AsyncGenerator<TurnEvent, R>): Promise<R> {
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}
