import type { ArtifactContent } from "@model/artifact";
import type { WorkspaceAction } from "@model/ai";
import type { ToolId, ToolScope, ToolSurface } from "@model/tools";
import { TOOLS, isPublicTool, scopeFor } from "@model/tools";
import { membershipFor } from "@services/core/accounts";
import { membershipsOf } from "@services/core/workspaces";
import { getTool } from "@services/core/ai/tools";
import { runTool } from "@services/core/ai/execute";
import { makeWorkspaceReader } from "@services/core/ai/reader";
import {
    Built,
    applyToContent,
    commitContent,
    commitNew,
    loadContent,
} from "@services/core/ai/effects";
import { setTrashed, updateArtifact } from "@services/core/artifacts";
import type { WorkspaceRow } from "@services/core/accounts";
import { capture } from "@services/utils/analytics";

// One call, for any caller that is not the app itself. MCP and the public API differ in how they
// authenticated and in how they phrase an answer, and in nothing else: the workspace a call lands
// in, the effect it takes, and every refusal are decided here so the two cannot drift apart.
//
// It returns a plain outcome rather than either surface's wire shape. Turning that into JSON-RPC or
// into an HTTP status is the only thing left to the surface.

export interface Grant {
    userId: string;
    workspaceIds: string[];
    defaultWorkspaceId: string;
    scopes: ToolScope[];
}

export type Outcome =
    | {
          ok: true;
          result: unknown;
          note?: string;
          workspace?: { id: string; name: string };
          artifactId?: string;
          rendered?: ArtifactContent | null;
      }
    | { ok: false; kind: "no-tool" | "needs-auth" | "not-found" | "refused"; message: string }
    | { ok: false; kind: "scope"; needs: ToolScope; message: string };

const no = (
    kind: "no-tool" | "needs-auth" | "not-found" | "refused",
    message: string,
): Outcome => ({
    ok: false,
    kind,
    message,
});

// Tools that build a whole piece rather than change one: they end with an artifact that did not
// exist before, so what they produce is stored rather than patched over something.
const CREATES = new Set<ToolId>(["generate-artifact", "create-artifact"]);

// Tools whose answer is a view of an artifact, and so are worth painting rather than describing.
export const RENDERS = new Set<ToolId>([
    "read-artifact",
    "add-section",
    "rewrite-section",
    "revise-element",
    "edit-artifact",
    "reorder-section",
    "remove-section",
    "set-theme",
    "set-format",
    "generate-artifact",
    "create-artifact",
]);

// Reads that need the stored tree the way a write does: the body is handed it, and the outcome
// carries it back for a component to paint. Nothing is written back, so they stay reads.
export const INSPECTS = new Set<ToolId>(["show-sections"]);

// Reads about one named artifact whose body resolves the id itself, through the library reader
// rather than through the tree loaded here. Loading it anyway is what turns a missing artifact into
// a refusal both surfaces can act on, instead of a successful answer whose prose says otherwise.
const RESOLVES = new Set<ToolId>(["read-artifact"]);

const MISSING = "That artifact was not found.";

// Postgres compares uuids, so an id that is not one throws in the first query that touches it
// rather than simply not matching. A made-up id is a missing artifact, not a server fault.
const ARTIFACT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A WorkspaceAction is what a tool returns instead of doing the thing, because in the app the client
 * performs it behind a confirm. With no client, performing it here is the whole point.
 *
 * Null where the artifact it names was not there: this is the only place that learns it, since the
 * tool bodies return an intention without ever reading a row.
 */
async function perform(workspaceId: string, action: WorkspaceAction): Promise<string | null> {
    switch (action.kind) {
        case "rename":
            return (await updateArtifact(workspaceId, action.id, { title: action.title }))
                ? `Renamed to “${action.title}”.`
                : null;
        case "move":
            if (!(await updateArtifact(workspaceId, action.id, { folderId: action.folderId })))
                return null;
            return action.folderId ? "Moved into the folder." : "Moved out of its folder.";
        case "trash":
            return (await setTrashed(workspaceId, action.id, new Date()))
                ? "Moved to Trash."
                : null;
        case "restore":
            return (await setTrashed(workspaceId, action.id, null)) ? "Restored from Trash." : null;
        default:
            // share and export route to guarded UI by design, and have no server-side path
            return `“${action.kind}” cannot be done from here yet.`;
    }
}

const isAction = (v: unknown): v is WorkspaceAction =>
    !!v && typeof v === "object" && typeof (v as WorkspaceAction).kind === "string";

function refused(
    out: { ok: false } & Record<string, unknown>,
    id: ToolId,
    title: string,
    wsName: string,
    surface: Call["surface"],
): Outcome {
    if (out.reason === "scope")
        return { ok: false, kind: "scope", needs: out.needs as ToolScope, message: "not granted" };
    if (out.reason === "entitlement")
        return no("refused", `“${title}” needs a higher plan on ${wsName}.`);
    if (out.reason === "bad-input") return no("refused", (out.issues as string[]).join("; "));
    if (out.reason === "credits")
        return no("refused", `Not enough credits in ${wsName}: ${String(out.remaining)} left.`);
    // Name the surface rather than saying "here": the caller is a program on the other side of MCP or
    // the v1 API, and "here" is the one thing it cannot see.
    if (out.reason === "wrong-surface")
        return no(
            "refused",
            `“${id}” is not available over ${surface === "mcp" ? "MCP" : "the API"}.`,
        );
    return no("refused", `“${id}” is not available.`);
}

export interface Call {
    id: ToolId;
    surface: Extract<ToolSurface, "mcp" | "api">;
    input: Record<string, unknown>;
    /** the workspace the caller named, if any; otherwise the one the grant defaults to */
    workspace?: string;
}

/**
 * The workspace a call landed in, filled in the moment it resolves.
 *
 * One report is raised around the whole call, so a refusal is measured the same way a success is,
 * and a refusal carries no workspace of its own for the report to read.
 */
interface Landing {
    workspaceId?: string;
}

/** One distinct id for every caller with no token, since none of them is a person we know. */
const ANONYMOUS = "delegated-anonymous";

export async function callDelegated(call: Call, grant: Grant | null): Promise<Outcome> {
    const startedAt = Date.now();
    const landing: Landing = {};
    const out = await dispatch(call, grant, landing);
    const def = TOOLS[call.id];
    // No token means no person to attribute to. The event still says that a call arrived and how it
    // ended, and mints no profile we would never query.
    const who = grant
        ? {
              userId: grant.userId,
              ...(landing.workspaceId ? { workspaceId: landing.workspaceId } : {}),
          }
        : { userId: ANONYMOUS, anonymous: true };
    capture(who, "delegated_tool_called", {
        tool_id: call.id,
        surface: call.surface,
        ...(def ? { scope: scopeFor(call.id), effect: def.effect ?? "write" } : {}),
        outcome: out.ok ? "ok" : out.kind,
        authenticated: !!grant,
        named_workspace: !!call.workspace || typeof call.input.workspace === "string",
        ms: Date.now() - startedAt,
    });
    return out;
}

async function dispatch(call: Call, grant: Grant | null, landing: Landing): Promise<Outcome> {
    const { id, surface } = call;
    const def = TOOLS[id];
    const tool = getTool(id);
    if (!def || !tool) return no("no-tool", `There is no tool called “${String(id)}”.`);

    // A public tool is a curated catalog rather than somebody's content, so it needs no account and
    // no workspace: this is what lets a caller see what Galleo offers before signing in.
    if (isPublicTool(id)) {
        const { workspace: _w, artifact: _a, ...open } = call.input;
        const anon = await runTool({ id, surface, input: open }, null, { ctx: { image: {} } });
        return anon.ok
            ? { ok: true, result: anon.result }
            : refused(anon, id, def.title, "this account", call.surface);
    }
    if (!grant) return no("needs-auth", "Sign in to Galleo to use this.");

    // Ahead of the workspace lookup: a caller that may not run this tool learns nothing about which
    // workspaces this account has, and never reaches a body that could spend credits.
    const need = scopeFor(id);
    if (!grant.scopes.includes(need))
        return { ok: false, kind: "scope", needs: need, message: "not granted" };

    // The one tool about the account rather than one workspace, and the single exception to the
    // resolution below. Scoped by the grant either way: it lists only what this connection covers.
    if (id === "list-workspaces") {
        const reachable = (await membershipsOf(grant.userId))
            .filter((m) => grant.workspaceIds.includes(m.id))
            .map((m) => ({
                id: m.id,
                name: m.name,
                role: m.role,
                isDefault: m.id === grant.defaultWorkspaceId,
            }));
        const listed = await runTool({ id, surface, input: {} }, null, {
            ctx: { image: {}, account: { workspaces: async () => reachable } },
        });
        return listed.ok
            ? { ok: true, result: listed.result }
            : refused(listed, id, def.title, "this account", call.surface);
    }

    const { workspace: named, artifact: target, ...input } = call.input;
    const wanted = call.workspace ?? (typeof named === "string" ? named : "");
    // Destroying in the wrong tenant is the one mistake that is expensive, so a destructive call
    // has to say where when there is more than one place it could mean. With a single workspace on
    // the grant there is no ambiguity to resolve, and refusing would be friction rather than safety.
    if (!wanted && def.effect === "destructive" && grant.workspaceIds.length > 1)
        return no("refused", `Name the workspace to run “${def.title}” in.`);
    const workspaceId = wanted || grant.defaultWorkspaceId;
    if (!grant.workspaceIds.includes(workspaceId))
        return no("refused", `This connection was not granted access to workspace ${workspaceId}.`);

    landing.workspaceId = workspaceId;

    const membership = await membershipFor(grant.userId, workspaceId);
    if (!membership) return no("refused", "That workspace is no longer available to this account.");
    const ws: WorkspaceRow = membership.ws;
    const who = { userId: grant.userId, ws, role: membership.role };
    const viewer = {
        userId: grant.userId,
        role: membership.role,
        workspaceDefault: ws.defaultArtifactAccess,
    };
    const reader = makeWorkspaceReader(ws.id, viewer);

    // A tool that changes an artifact runs against the stored tree and writes back through the same
    // save the editor uses, so the search columns, `seq` and the collaboration resync all follow.
    const changes = !!tool.patch;
    const wants = changes || INSPECTS.has(id) || RESOLVES.has(id);
    const artifactId =
        [target, input.artifactId, input.id].find(
            (v): v is string => typeof v === "string" && v.length > 0,
        ) ?? null;
    if (wants && !artifactId) return no("refused", "Name the artifact.");
    if (artifactId && !ARTIFACT_ID.test(artifactId)) return no("not-found", MISSING);
    const content =
        wants && artifactId ? await loadContent({ workspaceId: ws.id, artifactId }) : null;
    if (wants && !content) return no("not-found", MISSING);

    // Creation has no artifact to load and none to patch: it makes one. Generation streams its work
    // and is gathered as it goes; a direct create hands the whole tree over at once.
    if (CREATES.has(id)) {
        const given = input as {
            surface?: string;
            theme?: string;
            title?: string;
            content?: { format?: string; theme?: string; sections?: unknown[] };
        };
        const built = new Built(
            given.content
                ? { format: given.content.format, theme: given.content.theme }
                : { format: given.surface, theme: given.theme },
        );
        if (given.content) built.seed(given.content, given.title);
        const made = await runTool({ id, surface, input }, who, {
            ctx: { image: {}, workspace: reader },
            onEvent: built.watch,
        });
        if (!made.ok) return refused(made, id, def.title, ws.name, call.surface);
        const newId = await commitNew(ws.id, grant.userId, built);
        if (!newId) return no("refused", "The piece was built but could not be saved.");
        const made_content = built.content();
        return {
            ok: true,
            result: {
                id: newId,
                title: built.named,
                sections: made_content.sections.length,
                format: made_content.format,
            },
            note: `Built “${built.named}” — ${made_content.sections.length} sections. It is in ${ws.name}.`,
            workspace: { id: ws.id, name: ws.name },
            artifactId: newId,
            rendered: made_content,
        };
    }

    const out = await runTool(
        { id, surface, input },
        { ...who, scopes: grant.scopes },
        {
            ctx: { image: {}, workspace: reader, ...(content ? { artifact: content } : {}) },
        },
    );
    if (!out.ok) return refused(out, id, def.title, ws.name, call.surface);

    let note: string | undefined;
    if (changes && content && artifactId) {
        const next = applyToContent(content, tool.patch!(out.result, input));
        await commitContent({ workspaceId: ws.id, artifactId }, next);
        note = "Saved.";
    } else if (isAction(out.result)) {
        const done = await perform(ws.id, out.result);
        if (done === null) return no("not-found", MISSING);
        note = done;
    }

    return {
        ok: true,
        result: out.result,
        note,
        workspace: { id: ws.id, name: ws.name },
        ...(artifactId ? { artifactId } : {}),
        // A write reloads, so what a component paints is the saved state rather than the one the
        // tool started from; a read wrote nothing and already holds it.
        rendered:
            changes && artifactId && RENDERS.has(id)
                ? await loadContent({ workspaceId: ws.id, artifactId })
                : content,
    };
}
