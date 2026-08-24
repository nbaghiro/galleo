import { Hono } from "hono";
import { z } from "zod";
import { cleanDisplayName } from "@model/workspace";
import { BAD_BODY, readJson, rateLimit, setSessionCookie } from "@services/utils/http";
import {
    changePassword,
    connectionsOf,
    passwordError,
    overPasswordCap,
    unlinkProvider,
    updatePrefs,
    updateProfile,
} from "@services/core/accounts";
import { appsFor, purgeSpent, revokeApp } from "@services/core/authorization";
import { membershipsOf } from "@services/core/workspaces";
import { requireSession, requireUser, type AuthedEnv } from "./middleware";

// Everything under /me: the account itself, as opposed to /auth/* (the session lifecycle) and
// /workspace (the tenant).
export const account = new Hono<AuthedEnv>();

// The change form takes the current password, so it is a guessing target the same way login is.
const passwordLimiter = rateLimit({ name: "password-change", limit: 10, windowMs: 15 * 60_000 });

account.get("/me", requireSession, (c) => c.json({ user: c.get("user") }));

// name is nullish rather than optional: sending null clears it, and zod keeps the key present so
// the "nothing to update" check can still tell an absent field from a cleared one.
const zProfile = z.object({ name: z.string().nullish() });
const zPassword = z.object({ current: z.string().optional(), password: z.string().optional() });

account.patch("/me", requireUser, async (c) => {
    const body = await readJson(c, zProfile);
    if (!body) return c.json(BAD_BODY, 400);
    if (!("name" in body)) return c.json({ error: "nothing to update" }, 400);
    const user = await updateProfile(c.get("user").id, cleanDisplayName(body.name));
    return user ? c.json({ user }) : c.json({ error: "account not found" }, 404);
});

account.post("/me/password", passwordLimiter, requireUser, async (c) => {
    const body = await readJson(c, zPassword);
    if (!body) return c.json(BAD_BODY, 400);
    const { current, password } = body;
    if (!password) return c.json({ error: "a new password is required" }, 400);
    const pwErr = passwordError(password);
    if (pwErr) return c.json({ error: pwErr }, 400);
    // cap before scrypt, as login does: an over-cap current can't match any stored hash
    if (current && overPasswordCap(current))
        return c.json({ error: "that current password is wrong" }, 403);

    const result = await changePassword(c.get("user").id, current, password);
    if ("error" in result) {
        if (result.error === "no-account") return c.json({ error: "account not found" }, 404);
        if (result.error === "current-required")
            return c.json({ error: "enter your current password" }, 400);
        return c.json({ error: "that current password is wrong" }, 403);
    }
    // the write moved passwordChangedAt, which invalidates the cookie that authorized this request
    setSessionCookie(c, result.user.id);
    return c.json({ user: result.user });
});

account.get("/me/connections", requireUser, async (c) =>
    c.json({ connections: await connectionsOf(c.get("user").id) }),
);

account.delete("/me/connections/:provider", requireUser, async (c) => {
    const result = await unlinkProvider(c.get("user").id, c.req.param("provider"));
    if (result === "not-linked") return c.json({ error: "that account isn't linked" }, 404);
    if (result === "last-credential")
        return c.json({ error: "Set a password first, so you keep a way to sign in." }, 409);
    return c.json({ ok: true });
});

// Apps connected over MCP, which are a credential this account handed out rather than an identity
// it signed in with, so they sit beside /me/connections rather than inside it. The read is also
// where spent codes and long-dead tokens get swept: it is the one moment someone looks at this data,
// and the credit window already establishes that lazy-on-read beats a cron here.
account.get("/me/apps", requireUser, async (c) => {
    await purgeSpent();
    return c.json({ apps: await appsFor(c.get("user").id) });
});

account.delete("/me/apps/:clientId", requireUser, async (c) => {
    const gone = await revokeApp(c.get("user").id, c.req.param("clientId"));
    return gone ? c.json({ ok: true }) : c.json({ error: "that app isn't connected" }, 404);
});

account.patch("/me/prefs", requireUser, async (c) => {
    // updatePrefs narrows the patch itself (mergeUserPrefs), so the route hands it through as-is
    const user = await updatePrefs(c.get("user").id, await readJson(c, z.unknown()));
    return user ? c.json({ user }) : c.json({ error: "account not found" }, 404);
});

// Every workspace the account belongs to, independent of which one is active: the workspace router
// answers for the active tenant, this answers for the person.
account.get("/me/workspaces", requireUser, async (c) =>
    c.json({ memberships: await membershipsOf(c.get("user").id) }),
);
