import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "@services/utils/auth";
import { readJson, requireFeature } from "@services/utils/http";
import { currentUser, currentWorkspace } from "@services/core/accounts";
import {
    addRecipients,
    analyticsFor,
    artifactTitleIn,
    artifactTitleOf,
    cleanEmails,
    createLink,
    deleteLink,
    deleteRecipient,
    isWorkspaceMember,
    linkIdForSlug,
    linkIdsForArtifact,
    linkJson,
    linksForArtifact,
    linksForWorkspace,
    ownedLink,
    pingView,
    publicRead,
    recordView,
    updateLink,
    VISIBILITIES,
    type LinkBody,
    type RecipientView,
    type ViewerContext,
} from "@services/core/links";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const links = new Hono<WorkspaceEnv>();

// The raw IP/UA are read here and hashed in the domain; neither is ever stored.
const viewerOf = (c: Context): ViewerContext => ({
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
    userAgent: c.req.header("user-agent"),
    referrer: c.req.query("ref"),
    // populated when deployed behind a geo-aware proxy (Cloudflare/Vercel); null in dev
    country: c.req.header("cf-ipcountry") ?? c.req.header("x-vercel-ip-country") ?? null,
});

links.post("/artifacts/:id/links", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = requireFeature(
        c,
        ws,
        "publicLinks",
        "Public links are a paid feature — upgrade.",
    );
    if (denied) return denied;

    const artifactId = c.req.param("id");
    const title = await artifactTitleIn(ws.id, artifactId);
    if (title === null) return c.json({ error: "not found" }, 404);

    const body = await readJson<LinkBody>(c);
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility) ? body.visibility : "public";
    if (visibility === "protected" && !body.password)
        return c.json({ error: "A password is required for a protected link." }, 400);

    const link = await createLink(artifactId, body, visibility);
    if (!link) return c.json({ error: "create failed" }, 500);

    let recipients: RecipientView[] = [];
    if (visibility === "private") {
        const emails = cleanEmails(body.recipients);
        if (emails.length)
            recipients = await addRecipients(link, emails, body.message ?? null, {
                artifactTitle: title,
                workspaceName: ws.name,
                inviterName: user.name,
            });
    }
    return c.json({ link: { ...linkJson(link), recipients } });
});

links.get("/artifacts/:id/links", requireWorkspace, async (c) => {
    const artifactId = c.req.param("id");
    if ((await artifactTitleIn(c.get("ws").id, artifactId)) === null)
        return c.json({ error: "not found" }, 404);
    return c.json({ links: await linksForArtifact(artifactId) });
});

// A user with no workspace yet sees an empty list, not an error.
links.get("/links", requireUser, async (c) => {
    const ws = await currentWorkspace(c.get("user").id);
    if (!ws) return c.json({ links: [] });
    return c.json({ links: await linksForWorkspace(ws.id) });
});

links.patch("/links/:id", requireWorkspace, async (c) => {
    const link = await ownedLink(c.req.param("id"), c.get("ws").id);
    if (!link) return c.json({ error: "not found" }, 404);
    const body = await readJson<LinkBody>(c);
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility) ? body.visibility : link.visibility;
    if (visibility === "protected" && !body.password && !link.password)
        return c.json({ error: "A password is required for a protected link." }, 400);
    return c.json({ link: await updateLink(link, body, visibility) });
});

links.delete("/links/:id", requireWorkspace, async (c) => {
    const link = await ownedLink(c.req.param("id"), c.get("ws").id);
    if (!link) return c.json({ error: "not found" }, 404);
    await deleteLink(link.id);
    return c.json({ ok: true });
});

links.get("/links/:id/analytics", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const link = await ownedLink(c.req.param("id"), ws.id);
    if (!link) return c.json({ error: "not found" }, 404);
    const denied = requireFeature(c, ws, "analytics", "Analytics is a Premium feature — upgrade.");
    if (denied) return denied;
    return c.json(await analyticsFor([link.id], link.visibility === "private" ? [link.id] : []));
});

links.get("/artifacts/:id/analytics", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const artifactId = c.req.param("id");
    if ((await artifactTitleIn(ws.id, artifactId)) === null)
        return c.json({ error: "not found" }, 404);
    const denied = requireFeature(c, ws, "analytics", "Analytics is a Premium feature — upgrade.");
    if (denied) return denied;
    const rows = await linkIdsForArtifact(artifactId);
    return c.json(
        await analyticsFor(
            rows.map((r) => r.id),
            rows.filter((r) => r.visibility === "private").map((r) => r.id),
        ),
    );
});

links.post("/links/:id/recipients", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const link = await ownedLink(c.req.param("id"), ws.id);
    if (!link) return c.json({ error: "not found" }, 404);
    const body = await readJson<{ emails?: unknown; message?: string | null }>(c);
    const emails = cleanEmails(body.emails);
    if (!emails.length) return c.json({ error: "No valid email addresses." }, 400);
    const added = await addRecipients(link, emails, body.message ?? null, {
        artifactTitle: (await artifactTitleOf(link.artifactId)) ?? "a document",
        workspaceName: ws.name,
        inviterName: user.name,
    });
    return c.json({ recipients: added });
});

links.delete("/links/:id/recipients/:rid", requireWorkspace, async (c) => {
    const link = await ownedLink(c.req.param("id"), c.get("ws").id);
    if (!link) return c.json({ error: "not found" }, 404);
    await deleteRecipient(link.id, c.req.param("rid"));
    return c.json({ ok: true });
});

// UNAUTHENTICATED — the only surface here that takes no session.
links.get("/p/:slug/content", async (c) => {
    const read = await publicRead(c.req.param("slug"), {
        password: c.req.query("pw"),
        token: c.req.query("k"),
    });
    if (read.status === 404) return c.json({ error: "not found" }, 404);
    if (read.status !== 200)
        return c.json(
            {
                error: read.error,
                needsPassword: true,
                theme: read.theme,
                customTheme: read.customTheme,
                format: read.format,
            },
            read.status,
        );

    // Owner previews don't count as views.
    const viewer = await currentUser(getCookie(c, SESSION_COOKIE));
    const isOwner = viewer && (await isWorkspaceMember(viewer.id, read.workspaceId));
    if (!isOwner) await recordView(read.linkId, read.recipientId, viewerOf(c));

    return c.json({
        title: read.title,
        content: read.content,
        branded: read.branded,
        customTheme: read.customTheme,
    });
});

// UNAUTHENTICATED — never reveals whether the slug exists.
links.post("/p/:slug/ping", async (c) => {
    const linkId = await linkIdForSlug(c.req.param("slug"));
    if (!linkId) return c.json({ ok: true });
    const body = await readJson<{ u?: number; t?: number }>(c);
    const unit =
        typeof body.u === "number" && Number.isInteger(body.u) && body.u >= 0
            ? Math.min(body.u, 999)
            : null;
    const total =
        typeof body.t === "number" && Number.isInteger(body.t) && body.t > 0
            ? Math.min(body.t, 999)
            : null;
    await pingView(linkId, { unit, total }, viewerOf(c));
    return c.json({ ok: true });
});
