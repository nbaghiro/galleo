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

// A WorkspaceAction is what a tool returns instead of doing the thing, because in the app the client
// performs it behind a confirm. With no client, performing it here is the whole point.
async function perform(workspaceId: string, action: WorkspaceAction): Promise<string> {
    switch (action.kind) {
        case "rename":
            await updateArtifact(workspaceId, action.id, { title: action.title });
            return `Renamed to “${action.title}”.`;
        case "move":
            await updateArtifact(workspaceId, action.id, { folderId: action.folderId });
            return action.folderId ? "Moved into the folder." : "Moved out of its folder.";
        case "trash":
            await setTrashed(workspaceId, action.id, new Date());
            return "Moved to Trash.";
        case "restore":
            await setTrashed(workspaceId, action.id, null);
            return "Restored from Trash.";
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
): Outcome {
    if (out.reason === "scope")
        return { ok: false, kind: "scope", needs: out.needs as ToolScope, message: "not granted" };
    if (out.reason === "entitlement")
        return no("refused", `“${title}” needs a higher plan on ${wsName}.`);
    if (out.reason === "bad-input") return no("refused", (out.issues as string[]).join("; "));
    if (out.reason === "credits")
        return no("refused", `Not enough credits in ${wsName}: ${String(out.remaining)} left.`);
    if (out.reason === "wrong-surface") return no("refused", `“${id}” is not available here.`);
    return no("refused", `“${id}” is not available.`);
}

export interface Call {
    id: ToolId;
    surface: Extract<ToolSurface, "mcp" | "api">;
    input: Record<string, unknown>;
    /** the workspace the caller named, if any; otherwise the one the grant defaults to */
    workspace?: string;
}

export async function callDelegated(call: Call, grant: Grant | null): Promise<Outcome> {
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
            : refused(anon, id, def.title, "this account");
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
            : refused(listed, id, def.title, "this account");
    }

    const { workspace: named, artifact: target, ...input } = call.input;
    const wanted = call.workspace ?? (typeof named === "string" ? named : "");
    const workspaceId = wanted || grant.defaultWorkspaceId;
    if (!grant.workspaceIds.includes(workspaceId))
        return no("refused", `This connection was not granted access to workspace ${workspaceId}.`);

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
    const artifactId =
        [target, input.artifactId, input.id].find(
            (v): v is string => typeof v === "string" && v.length > 0,
        ) ?? null;
    if (changes && !artifactId) return no("refused", "Name the artifact to change.");
    const content =
        changes && artifactId ? await loadContent({ workspaceId: ws.id, artifactId }) : null;
    if (changes && !content) return no("not-found", "That artifact was not found.");

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
        if (!made.ok) return refused(made, id, def.title, ws.name);
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
    if (!out.ok) return refused(out, id, def.title, ws.name);

    let note: string | undefined;
    if (changes && content && artifactId) {
        const next = applyToContent(content, tool.patch!(out.result, input));
        await commitContent({ workspaceId: ws.id, artifactId }, next);
        note = "Saved.";
    } else if (isAction(out.result)) {
        note = await perform(ws.id, out.result);
    }

    return {
        ok: true,
        result: out.result,
        note,
        workspace: { id: ws.id, name: ws.name },
        ...(artifactId ? { artifactId } : {}),
        rendered:
            RENDERS.has(id) && artifactId
                ? await loadContent({ workspaceId: ws.id, artifactId })
                : null,
    };
}
