import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { SCOPE_LABEL } from "@model/tools";
import type { Tokens } from "@themes";
import { resolveTheme, themeCssVars } from "@themes";
import { readUserPrefs } from "@model/workspace";
import { appUrl } from "@services/utils/env";
import { digest, SESSION_COOKIE } from "@services/utils/auth";
import { currentUser } from "@services/core/accounts";
import { rateLimit, readForm, readJson, zFormList, zFormText } from "@services/utils/http";
import { membershipsOf } from "@services/core/workspaces";
import {
    BASE_SCOPES,
    SCOPES,
    exchangeCode,
    machineGrant,
    resolveClient,
    issueCode,
    parseScopes,
    refreshTokens,
    registerClient,
    revokeToken,
} from "@services/core/authorization";
import type { Scope } from "@services/core/authorization";

// Galleo as an OAuth 2.1 authorization server for the MCP endpoint. The consent screen is rendered
// here rather than in the SPA because the browser arrives cold from a desktop client, with no app
// shell loaded and nothing to route.

export const authorize = new Hono();

export const MCP_RESOURCE = (): string => appUrl("/mcp");

authorize.get("/.well-known/oauth-protected-resource", (c) =>
    c.json(
        {
            resource: MCP_RESOURCE(),
            authorization_servers: [appUrl("")],
            scopes_supported: BASE_SCOPES,
            bearer_methods_supported: ["header"],
        },
        200,
        { "access-control-allow-origin": "*" },
    ),
);

authorize.get("/.well-known/oauth-authorization-server", (c) =>
    c.json(
        {
            issuer: appUrl(""),
            authorization_endpoint: appUrl("/oauth/authorize"),
            token_endpoint: appUrl("/oauth/token"),
            registration_endpoint: appUrl("/oauth/register"),
            scopes_supported: [...SCOPES, "offline_access"],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
            code_challenge_methods_supported: ["S256"],
            // a client may identify itself by a metadata document it hosts, which is what the spec
            // now prefers over registering a row per client here
            client_id_metadata_document_supported: true,
            token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
            authorization_response_iss_parameter_supported: true,
        },
        200,
        { "access-control-allow-origin": "*" },
    ),
);

/**
 * A redirect uri is the one thing standing between a client someone registered and a code landing
 * in their hands, so the set it may name is narrow: https anywhere, or http on loopback for a
 * desktop client that listens on a port. No fragment (the fragment is not sent to the server), no
 * wildcard, and no other scheme.
 */
const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);
const isRedirectUri = (raw: string): boolean => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOOPBACK.has(url.hostname);
};

const zRegister = z.looseObject({
    client_name: z.string().optional(),
    redirect_uris: z.array(z.string()).min(1).max(8),
});

// Unauthenticated and it writes a row, so it is the endpoint on this file that most needs a ceiling.
const registerLimiter = rateLimit({ name: "oauth-register", limit: 10, windowMs: 60 * 60_000 });
const authorizeLimiter = rateLimit({ name: "oauth-authorize", limit: 30, windowMs: 5 * 60_000 });
const consentLimiter = rateLimit({ name: "oauth-consent", limit: 20, windowMs: 15 * 60_000 });
const tokenLimiter = rateLimit({ name: "oauth-token", limit: 30, windowMs: 5 * 60_000 });

authorize.post("/oauth/register", registerLimiter, async (c) => {
    const body = await readJson(c, zRegister);
    if (!body) return c.json({ error: "invalid_client_metadata" }, 400);
    if (!body.redirect_uris.every(isRedirectUri))
        return c.json(
            {
                error: "invalid_redirect_uri",
                error_description:
                    "redirect_uris must be https, or http on a loopback address, and carry no fragment",
            },
            400,
        );
    const client = await registerClient({
        name: body.client_name?.slice(0, 80) || "Unnamed client",
        redirectUris: body.redirect_uris,
        source: "dynamic",
    });
    return c.json(
        {
            client_id: client.clientId,
            client_name: client.name,
            redirect_uris: client.redirectUris,
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
        },
        201,
    );
});

const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (ch) =>
        ch === "&"
            ? "&amp;"
            : ch === "<"
              ? "&lt;"
              : ch === ">"
                ? "&gt;"
                : ch === '"'
                  ? "&quot;"
                  : "&#39;",
    );

// Scope ids are a wire format. What a person is being asked to agree to is a sentence, so the
// catalog's labels are what the screen says.
const readable = (scopes: readonly Scope[]): string => {
    const parts = scopes.map((s) => SCOPE_LABEL[s]);
    if (parts.length <= 1) return parts[0] ?? "do nothing";
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

// Rendered here rather than in the SPA, so it has no app shell to inherit from: the theme the
// person chose is resolved server side and emitted as the same custom properties `@ui` styles
// against, and the vendored stylesheet supplies the faces that theme names.
const page = (title: string, body: string, tokens: Tokens): string => {
    const vars = Object.entries(themeCssVars(tokens))
        .map(([k, v]) => `${k}:${v}`)
        .join(";");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/fonts.css"><style>
:root{${vars}}
*{box-sizing:border-box}
body{margin:0;background:var(--color-canvas);color:var(--color-ink);font-family:var(--font-body);-webkit-font-smoothing:antialiased}
.wrap{max-width:420px;margin:0 auto;padding:56px 24px}
h1{font-family:var(--font-display);font-weight:var(--hw);font-size:24px;letter-spacing:-0.01em;margin:0 0 8px}
.lede{color:var(--color-soft);font-size:14px;line-height:1.55;margin:0 0 22px}
.row{display:flex;align-items:center;gap:10px;padding:11px 13px;border:var(--border-width) solid var(--color-line);border-radius:var(--radius-lg);margin-bottom:8px;background:var(--color-panel);box-shadow:var(--shadow);cursor:pointer}
.row:hover{border-color:var(--color-accent)}
.row input{accent-color:var(--color-accent);width:16px;height:16px;cursor:pointer}
.name{flex:1;font-weight:600;font-size:14px}
.role{color:var(--color-muted);font-size:12px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.04em}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:var(--radius-lg);background:var(--color-accent);color:var(--color-onaccent);font-family:var(--font-body);font-size:14px;font-weight:600;cursor:pointer}
button:hover{opacity:0.92}
.foot{color:var(--color-muted);font-size:12px;margin-top:18px;line-height:1.5}
</style></head>
<body><div class="wrap">${body}</div></body></html>`;
};

/**
 * The consent POST carries no server state between the two requests, which is what keeps the flow
 * stateless — but it also means the POST alone decides that a person agreed. SameSite=Lax already
 * stops a cross-site form reaching it with the cookie attached; this is the endpoint's own defence
 * rather than a property of the cookie policy, and it costs one hidden field.
 *
 * Bound to the session, the client and the challenge, so a token minted for one grant cannot be
 * replayed to approve a different one.
 */
const consentToken = (userId: string, clientId: string, codeChallenge: string): string =>
    digest(`consent|${userId}|${clientId}|${codeChallenge}`);

// Every parameter the callback needs, carried through the consent POST so no server state is held
// between the two requests.
const CARRIED = [
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "scope",
    "resource",
] as const;

authorize.get("/oauth/authorize", authorizeLimiter, async (c) => {
    const q = c.req.query();
    // currentUser, not a bare cookie read: a session minted before a password reset was revoked by
    // that reset, and minting an MCP token is exactly what a revoked session must not still do.
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) {
        const next = `/oauth/authorize?${new URLSearchParams(q).toString()}`;
        // Not `/`: signed out, that path serves the marketing site, which has no reason to know
        // about `next` and drops it on the way to sign-in, stranding the desktop client that sent
        // us here. Every other path serves the app shell, whose auth gate keeps the url intact.
        return c.redirect(`/connect?next=${encodeURIComponent(next)}`);
    }
    const userId = user.id;
    if (q.code_challenge_method && q.code_challenge_method !== "S256")
        return c.text("code_challenge_method must be S256", 400);
    if (!q.client_id || !q.redirect_uri || !q.code_challenge)
        return c.text("client_id, redirect_uri and code_challenge are required", 400);
    const client = await resolveClient(q.client_id);
    if (!client) return c.text("unknown client_id", 400);
    if (!client.redirectUris.includes(q.redirect_uri)) return c.text("redirect_uri mismatch", 400);

    const memberships = await membershipsOf(userId);
    if (!memberships.length) return c.text("this account has no workspace", 400);
    const wanted = parseScopes(q.scope);
    const scopes: Scope[] = wanted.length ? wanted : BASE_SCOPES;

    const hidden =
        CARRIED.map((k) => `<input type="hidden" name="${k}" value="${esc(q[k] ?? "")}">`).join(
            "",
        ) +
        `<input type="hidden" name="consent" value="${esc(consentToken(userId, q.client_id, q.code_challenge))}">`;
    const rows = memberships
        .map(
            (m, i) =>
                `<label class="row"><input type="checkbox" name="ws" value="${esc(m.id)}" checked>
<span class="name">${esc(m.name)}</span><span class="role">${esc(m.role)}</span>
<input type="radio" name="default_ws" value="${esc(m.id)}"${i === 0 ? " checked" : ""} title="Use this workspace by default"></label>`,
        )
        .join("");

    return c.html(
        page(
            "Connect to Galleo",
            `<h1>Connect ${esc(client.name)}</h1>
<p class="lede">It will be able to ${esc(readable(scopes))} in the workspaces you pick. The radio button marks the one it uses when it does not name one.</p>
<form method="post" action="/oauth/consent">${hidden}
${rows}
<button type="submit">Allow access</button>
</form>
<p class="foot">Signed in as this browser's Galleo account. Close this tab to cancel.</p>`,
            resolveTheme(readUserPrefs(user.prefs).appTheme ?? "").tokens,
        ),
    );
});

const zConsent = z.object({
    ws: zFormList,
    default_ws: zFormText,
    client_id: zFormText,
    redirect_uri: zFormText,
    state: zFormText,
    code_challenge: zFormText,
    scope: zFormText,
    resource: zFormText,
    consent: zFormText,
});

authorize.post("/oauth/consent", consentLimiter, async (c) => {
    const user = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!user) return c.text("not signed in", 401);
    const userId = user.id;
    const body = await readForm(c, zConsent);
    if (!body) return c.text("invalid form", 400);

    // the form has to be one this server handed to this person for this client and challenge
    if (
        !body.client_id ||
        !body.code_challenge ||
        body.consent !== consentToken(userId, body.client_id, body.code_challenge)
    )
        return c.text("this consent form is not valid; start again from the client", 400);

    if (!body.ws.length) return c.text("pick at least one workspace", 400);
    const allowed = new Set((await membershipsOf(userId)).map((m) => m.id));
    if (body.ws.some((id) => !allowed.has(id))) return c.text("not a member", 403);
    const defaultWorkspaceId = allowed.has(body.default_ws) ? body.default_ws : body.ws[0]!;

    const client = await resolveClient(body.client_id);
    if (!client || !client.redirectUris.includes(body.redirect_uri))
        return c.text("redirect_uri mismatch", 400);

    const wanted = parseScopes(body.scope);
    const code = await issueCode({
        clientId: body.client_id,
        userId,
        workspaceIds: body.ws,
        defaultWorkspaceId,
        scopes: wanted.length ? wanted : BASE_SCOPES,
        resource: body.resource || MCP_RESOURCE(),
        codeChallenge: body.code_challenge,
        redirectUri: body.redirect_uri,
    });
    const back = new URL(body.redirect_uri);
    back.searchParams.set("code", code);
    back.searchParams.set("iss", appUrl(""));
    if (body.state) back.searchParams.set("state", body.state);
    return c.redirect(back.toString());
});

const zToken = z.object({
    grant_type: zFormText,
    client_id: zFormText,
    client_secret: zFormText,
    scope: zFormText,
    code: zFormText,
    code_verifier: zFormText,
    redirect_uri: zFormText,
    refresh_token: zFormText,
});

authorize.post("/oauth/token", tokenLimiter, async (c) => {
    const body = await readForm(c, zToken);
    if (!body) return c.json({ error: "invalid_request" }, 400);
    const clientId = body.client_id;
    const issued =
        body.grant_type === "client_credentials"
            ? // the integration path: a secret rather than a person, so no browser and no consent
              await machineGrant(clientId, body.client_secret, parseScopes(body.scope))
            : body.grant_type === "refresh_token"
              ? await refreshTokens(body.refresh_token, clientId)
              : body.grant_type === "authorization_code"
                ? await exchangeCode({
                      code: body.code,
                      verifier: body.code_verifier,
                      clientId,
                      redirectUri: body.redirect_uri,
                  })
                : "unsupported_grant_type";
    if (typeof issued === "string")
        return c.json({ error: issued }, issued === "invalid_client" ? 401 : 400);
    return c.json(
        {
            access_token: issued.accessToken,
            ...(issued.refreshToken ? { refresh_token: issued.refreshToken } : {}),
            token_type: "Bearer",
            expires_in: issued.expiresIn,
            scope: issued.scopes.join(" "),
        },
        200,
        { "cache-control": "no-store" },
    );
});

// RFC 7009. A client handing a credential back is the polite half of disconnecting; the other half
// is the account settings, which revoke without the client's help. Always 200: whether a token
// exists is not something an unauthenticated caller gets to find out.
const zRevoke = z.object({ token: zFormText, client_id: zFormText });

authorize.post("/oauth/revoke", tokenLimiter, async (c) => {
    const body = await readForm(c, zRevoke);
    if (body?.token && body.client_id) await revokeToken(body.token, body.client_id);
    return c.body(null, 200);
});
