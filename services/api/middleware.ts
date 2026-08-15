import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { User, WorkspaceRole } from "@model/workspace";
import { SESSION_COOKIE } from "@services/utils/auth";
import { currentUser, currentWorkspace, type WorkspaceRow } from "@services/core/accounts";
import { roleOf } from "@services/core/workspaces";
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
    Variables: { user: User; ws: WorkspaceRow };
}

export const requireUser: MiddlewareHandler<AuthedEnv> = async (c, next) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    return next();
};

export const requireWorkspace: MiddlewareHandler<WorkspaceEnv> = async (c, next) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(user.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    c.set("user", user);
    c.set("ws", ws);
    return next();
};

// Mounted after requireWorkspace. Owner derives from the workspace row; admin from the member row.
export const requireRole =
    (min: Exclude<WorkspaceRole, "member">): MiddlewareHandler<WorkspaceEnv> =>
    async (c, next) => {
        const role = await roleOf(c.get("ws"), c.get("user").id);
        const allowed = role === "owner" || (min === "admin" && role === "admin");
        if (!allowed)
            return c.json(
                { error: min === "owner" ? "only the workspace owner can do this" : "admins only" },
                403,
            );
        return next();
    };

// The client may pin any step to a specific model; the registry decides which ids survive.
export const overridesFrom = (c: Context): ModelOverrides =>
    parseOverrides(c.req.header(MODEL_HEADER));
