import { z, type ZodType } from "zod";
import type { ToolId, ToolNeed, ToolSurface } from "@model/tools";
import type { ToolInput } from "@model/tools";
import type { ToolSpec } from "@model/tools";
import { TOOL_SPEC, TOOLS, availableTo } from "@model/tools";
import type { ModelOverrides } from "@services/core/models";
import type { ModelTier } from "@model/billing";
import type {
    ArtifactRef,
    Brief,
    ChatBlock,
    Generation,
    Patch,
    PendingProposal,
    TurnEvent,
} from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { WorkspaceCreditFields } from "@services/core/ledger";
import type { WorkspaceRole } from "@model/workspace";
import type { ToolScope } from "@model/tools";
import type { ImageOptions } from "./images";
import type { EventName, EventProps } from "@model/analytics";
import { capture } from "@services/utils/analytics";
import { traceUse } from "@services/core/traces";

// The run half of a tool. Its identity, description, input schema and price all live in
// @model/tools; this module only supplies the body and refuses one that has no definition.

// injected by the route; may be absent (e.g. the generate modal), so tools guard on it
export interface WorkspaceReader {
    find(query?: string): Promise<ArtifactRef[]>; // recent when blank
    read(id: string): Promise<{ ref: ArtifactRef; content: ArtifactContent } | null>;
}

/** Account-level reach, for the one tool that is about the person rather than one workspace. */
interface AccountReader {
    workspaces(): Promise<{ id: string; name: string; role: string; isDefault: boolean }[]>;
}

export interface GenerationRead {
    generation: Generation;
    content: ArtifactContent; // the draft artifact the generation writes into
}

// Where generations live. The database-backed one is services/core/generations.ts; the eval harness
// and the tests hand in an in-memory one, so a tool body never touches a row itself.
export interface GenerationStore {
    create(input: { brief: Brief; artifactId?: string }): Promise<GenerationRead>;
    read(id: string): Promise<GenerationRead | null>;
    /** Persist both halves of a patch and hand back the state after it. */
    apply(id: string, patch: Patch): Promise<GenerationRead>;
    /** Record how the piece was made, once it is finished: the models are the ones that ran. */
    finish(id: string, models?: Record<string, string>): Promise<void>;
    /** The credits the run's calls settled so far. */
    spent(id: string): Promise<number>;
    // one writer at a time per generation: a second write while one is in flight is refused
    claim(id: string): Promise<boolean>;
    release(id: string): Promise<void>;
    held(id: string): Promise<boolean>;
}

// Who a call is for. Carried on the context so the chat body can run its sub-tools through the
// same executor; absent `scopes` means the caller acts as themselves in the product.
export interface ToolPrincipal {
    userId: string;
    ws: WorkspaceCreditFields;
    role: WorkspaceRole;
    scopes?: readonly ToolScope[];
}

export interface ToolContext {
    artifact?: ArtifactContent;
    // the artifact `artifact` mirrors when the server holds it (a generation's draft, a delegated
    // target); absent when the caller owns the document and applies patches itself
    artifactId?: string;
    generation?: Generation;
    generations?: GenerationStore;
    image: ImageOptions;
    workspace?: WorkspaceReader;
    account?: AccountReader;
    principal?: ToolPrincipal;
    signal?: AbortSignal;
    tier?: ModelTier; // threaded to every model call in the turn
    models?: ModelOverrides; // per-step model choice (see ../models.ts)
    maxSections?: number;
    // retrieval over the request's attached contexts; absent when none are attached
    pack?: (query: string) => Promise<string | null>;
    // chat only: relevant exchanges older than the client's verbatim history window
    recall?: (query: string) => Promise<string | null>;
    // cards the agent left that the user has not acted on, so a spoken approval can name one
    pending?: PendingProposal[];
    // run a sub-tool with this same context
    use<I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R>;
}

export interface Tool<Input, Result> {
    id: ToolId;
    describe: string;
    input: ZodType<Input>;
    run(input: Input, ctx: ToolContext): AsyncGenerator<TurnEvent, Result>;
    // How this tool's result changes an artifact, for a body that returns a value rather than
    // yielding its patch. The executor turns it into the tool's final patch event.
    //
    // Erased rather than `(result: Result, input: Input)` because both would sit in parameter
    // position, and the registry holds every tool as `Tool<never, unknown>`. `implement` takes the
    // typed mapper and narrows here, so authoring stays checked and only storage is loose.
    patch?: (result: unknown, input: unknown) => Patch;
    // How the agent shows the result. Absent = the generic presenter: a patch becomes a proposal,
    // a workspace action an action card, a bare result a note to the model.
    present?: (result: unknown, input: unknown, patches: Patch[]) => ChatBlock | ChatBlock[] | null;
    // The one line the model reads back after the call. Absent = derived from the result.
    note?: (result: unknown, input: unknown) => string;
}

// the id→tool map can't carry each tool's concrete I/R
type AnyTool = Tool<never, unknown>;

// A product event from inside a tool body, attributed to the person the call is for. Nothing is
// sent for an unaccounted run (the eval harness, a public tool), which has nobody to attribute to.
export function report<N extends EventName>(
    ctx: ToolContext,
    event: N,
    props: EventProps<N>,
): void {
    const p = ctx.principal;
    if (p) capture({ userId: p.userId, workspaceId: p.ws.id }, event, props);
}

const REGISTRY = new Map<ToolId, AnyTool>();

export interface Implementation<Id extends ToolId, R> {
    patch?: (result: R, input: ToolInput<Id>) => Patch;
    present?: (result: R, input: ToolInput<Id>, patches: Patch[]) => ChatBlock | ChatBlock[] | null;
    note?: (result: R, input: ToolInput<Id>) => string;
}

/**
 * Register the body of a tool that @model/tools already defines. Throws at import rather than at
 * call time, so a definition and its implementation cannot drift apart unnoticed.
 */
export function implement<Id extends ToolId, R>(
    id: Id,
    run: (input: ToolInput<Id>, ctx: ToolContext) => AsyncGenerator<TurnEvent, R>,
    impl: Implementation<Id, R> = {},
): Tool<ToolInput<Id>, R> {
    const def = TOOLS[id];
    if (!def) throw new Error(`tool "${id}" has no definition in @model/tools`);
    const found = (TOOL_SPEC as Partial<Record<ToolId, ToolSpec>>)[id];
    // an internal primitive is only ever reached through ctx.use with a typed object, so it needs no
    // agent-facing schema; anything an agent or MCP client can call does
    const reachable = def.surfaces.some((s) => s !== "internal");
    if (!found && reachable) throw new Error(`tool "${id}" has no describe/input in TOOL_SPEC`);
    const typed = <A, B>(fn: ((a: A, b: B, c: Patch[]) => unknown) | undefined) =>
        fn && ((a: unknown, b: unknown, c: Patch[]) => fn(a as A, b as B, c));
    const tool: Tool<ToolInput<Id>, R> = {
        id,
        describe: found?.describe ?? def.summary,
        input: (found?.input ?? z.unknown()) as ZodType<ToolInput<Id>>,
        run,
        patch:
            impl.patch &&
            ((result: unknown, input: unknown) => impl.patch!(result as R, input as ToolInput<Id>)),
        present: typed<R, ToolInput<Id>>(impl.present) as Tool<ToolInput<Id>, R>["present"],
        note:
            impl.note &&
            ((result: unknown, input: unknown) => impl.note!(result as R, input as ToolInput<Id>)),
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

/** What a context holds, in the catalog's terms, so `needs` and `without` can be read against it. */
function holdings(
    ctx: Pick<ToolContext, "artifact" | "generation" | "workspace" | "pack">,
): Set<ToolNeed> {
    const has = new Set<ToolNeed>();
    if (ctx.artifact) has.add("artifact");
    if (ctx.generation) has.add("generation");
    if (ctx.workspace) has.add("library");
    if (ctx.pack) has.add("contexts");
    return has;
}

/** The tools the agent is offered for this context: the catalog's surface, filtered by what is present. */
export function offeredTo(ctx: ToolContext): AnyTool[] {
    const has = holdings(ctx);
    return toolsFor("agent").filter((t) => availableTo(t.id, has));
}

/** Every tool that has a body at all, which is the set that can spend money. */
export function registeredToolIds(): ToolId[] {
    return [...REGISTRY.keys()];
}

export function makeContext(base: Omit<ToolContext, "use">): ToolContext {
    const ctx: ToolContext = {
        ...base,
        use: <I, R>(tool: Tool<I, R>, input: I): AsyncGenerator<TurnEvent, R> =>
            traceUse(tool.id, () => tool.run(input, ctx)),
    };
    return ctx;
}

/** Run a tool to completion and take its value, discarding the events it yields on the way. */
export async function drain<R>(gen: AsyncGenerator<TurnEvent, R>): Promise<R> {
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}
