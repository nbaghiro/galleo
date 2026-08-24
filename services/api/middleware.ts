import type { Context, Env, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { User, WorkspaceRole } from "@model/workspace";
import { mustConfirmEmail } from "@model/workspace";
import type { ArtifactAccess } from "@model/artifact";
import { atLeast } from "@model/artifact";
import { SESSION_COOKIE } from "@services/utils/auth";
import { currentMembership, currentUser, type WorkspaceRow } from "@services/core/accounts";
import { artifactStanding, type ArtifactStanding } from "@services/core/collaborators";
import { MODEL_HEADER, parseOverrides, type ModelOverrides } from "@services/core/models";

// The api layer's shared guard: the only non-resource file here. It exists because the gate needs
// both hono and a database read, and domain/ may not import hono.
//
// Reading the workspace also rolls the monthly credit window (there is no cron), so a route that
// only needs the id still goes through requireWorkspace and reads `ws.id`.

export interface AuthedEnv {
    Variables: { user: User };
}

export interface WorkspaceEnv {
    Variables: { user: User; ws: WorkspaceRow; role: WorkspaceRole };
}

const NEEDS_VERIFICATION = {
    error: "Confirm your email to continue.",
    needsVerification: true,
} as const;

/**
 * A session, verified or not. Only for the handful of routes an unconfirmed account must still
 * reach: reading itself, and asking for another confirmation mail. Everything else takes
 * `requireUser`, which is this plus the gate.
 */
export const requireSession: MiddlewareHandler<AuthedEnv> = async (c, next) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    return next();
};

export const requireUser: MiddlewareHandler<AuthedEnv> = async (c, next) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (mustConfirmEmail(user)) return c.json(NEEDS_VERIFICATION, 403);
    c.set("user", user);
    return next();
};

export const requireWorkspace: MiddlewareHandler<WorkspaceEnv> = async (c, next) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (mustConfirmEmail(user)) return c.json(NEEDS_VERIFICATION, 403);
    const membership = await currentMembership(user.id);
    if (!membership) return c.json({ error: "no workspace" }, 400);
    c.set("user", user);
    c.set("ws", membership.ws);
    c.set("role", membership.role);
    return next();
};

// Mounted after requireWorkspace, which resolved the role from the join it was already doing.
export const requireRole =
    (min: Exclude<WorkspaceRole, "member">): MiddlewareHandler<WorkspaceEnv> =>
    async (c, next) => {
        const role = c.get("role");
        const allowed = role === "owner" || (min === "admin" && role === "admin");
        if (!allowed)
            return c.json(
                { error: min === "owner" ? "only the workspace owner can do this" : "admins only" },
                403,
            );
        return next();
    };

// 404 for an artifact the caller cannot see at all, so a locked one is indistinguishable from a
// missing one; 403 only once they can see it but not do this.
//
// Workspace-scoped on purpose: an artifact the caller reaches only through a collaborator grant is
// simply not here, which is what keeps trash, publishing, and AI turns with the owning workspace.
export async function gateArtifact(
    c: Context<WorkspaceEnv>,
    id: string,
    need: ArtifactAccess,
): Promise<ArtifactStanding | Response> {
    const standing = await artifactStanding(c.get("user").id, id);
    if (!standing || standing.ws.id !== c.get("ws").id || standing.access === "none")
        return c.json({ error: "not found" }, 404);
    if (!atLeast(standing.access, need))
        return c.json({ error: DENIED[need] ?? "You don't have access to that." }, 403);
    return standing;
}

const DENIED: Partial<Record<ArtifactAccess, string>> = {
    edit: "You have view access to this artifact, so you can't change it.",
    comment: "You have view access to this artifact, so you can't comment on it.",
};

/**
 * The artifact-scoped gate: resolves the workspace FROM THE ARTIFACT ROW and takes collaborator
 * grants into account, so someone invited into a workspace they are not a member of can still open
 * the artifact. Every handler behind it must scope its queries on `gate.ws`, never `c.get("ws")` —
 * the latter is the caller's own workspace and would 404 a collaborator out of their invitation.
 *
 * `gateArtifact` above stays the right gate for anything that belongs to the owning workspace
 * (trash, publishing, AI turns): those are deliberately members-only.
 */
export async function gateShared<E extends Env & AuthedEnv>(
    c: Context<E>,
    id: string,
    need: ArtifactAccess,
): Promise<ArtifactStanding | Response> {
    const standing = await artifactStanding(c.get("user").id, id);
    if (!standing || standing.access === "none") return c.json({ error: "not found" }, 404);
    if (!atLeast(standing.access, need))
        return c.json({ error: DENIED[need] ?? "You don't have access to that." }, 403);
    return standing;
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;

// The client may pin any step to a specific model; the registry decides which ids survive.
export const overridesFrom = (c: Context): ModelOverrides =>
    parseOverrides(c.req.header(MODEL_HEADER));
