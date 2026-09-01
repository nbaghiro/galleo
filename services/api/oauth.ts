import { Hono } from "hono";
import type { Context } from "hono";
import type { Google } from "arctic";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { generateState, generateCodeVerifier, decodeIdToken } from "arctic";
import type { AuthProvider } from "@model/workspace";
import { appUrl } from "@services/utils/env";
import { readSession, SESSION_COOKIE } from "@services/utils/auth";
import { setSessionCookie } from "@services/utils/http";
import { capture } from "@services/utils/analytics";
import {
    googleProvider,
    linkOAuthAccount,
    linkProviderToUser,
    oauthProvidersReady,
    saveGoogleTokens,
    GOOGLE_DRIVE_SCOPE,
    OAUTH_SCOPES,
} from "@services/core/accounts";

// Failures redirect to /login?authError=<code>, which the auth page explains.
export const oauth = new Hono();

const STATE_COOKIE = "oauth_state";
const VERIFIER_COOKIE = "oauth_verifier";
const INTENT_COOKIE = "oauth_intent";
const TEMP_MAX_AGE = 60 * 10; // 10 min — long enough for the consent screen, short enough to expire

function claim(claims: Record<string, unknown>, key: string): string | null {
    const v = claims[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

interface OAuthIdentity {
    sub: string;
    email: string;
    emailVerified: boolean; // provider proved control of the address — gates linking to existing accounts
    name: string | null;
    avatarUrl: string | null;
}
type IdentityReader = (claims: Record<string, unknown>) => OAuthIdentity | null;

// Google issues an `email_verified` flag — require it, so an unverified address can't hijack a user.
const googleIdentity: IdentityReader = (claims) => {
    const sub = claim(claims, "sub");
    const email = claim(claims, "email");
    const verified = claims.email_verified === true || claims.email_verified === "true";
    if (!sub || !email || !verified) return null;
    return {
        sub,
        email,
        emailVerified: true,
        name: claim(claims, "name"),
        avatarUrl: claim(claims, "picture"),
    };
};

// "link" attaches the identity to the signed-in account; "connect" is link plus the Drive grant,
// begun from a popup that reports back to its opener instead of redirecting.
type Intent = "signin" | "link" | "connect";

function begin(c: Context, client: Google, intent: Intent): Response {
    const state = generateState();
    const verifier = generateCodeVerifier();
    const scopes = intent === "connect" ? [...OAUTH_SCOPES, GOOGLE_DRIVE_SCOPE] : OAUTH_SCOPES;
    const url = client.createAuthorizationURL(state, verifier, scopes);
    // a returning user re-approves only the new scope; already-granted ones ride along
    if (intent === "connect") url.searchParams.set("include_granted_scopes", "true");
    const opts = {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TEMP_MAX_AGE,
    } as const;
    setCookie(c, STATE_COOKIE, state, opts);
    setCookie(c, VERIFIER_COOKIE, verifier, opts);
    if (intent === "signin") deleteCookie(c, INTENT_COOKIE, { path: "/" });
    else setCookie(c, INTENT_COOKIE, intent, opts);
    return c.redirect(url.toString());
}

// Every terminal state of the connect popup answers with this page: it reports to the opener and
// closes itself. targetOrigin is our own origin, so no other window can read the result.
function connectResult(c: Context, ok: boolean, error?: string): Response {
    const detail = error ? `,error:${JSON.stringify(error)}` : "";
    const note = ok
        ? "Google Drive connected. You can close this window."
        : "Connection failed. You can close this window and try again.";
    return c.html(
        `<!doctype html><meta charset="utf-8"><title>Google connection</title>` +
            `<p style="font-family:system-ui;margin:24px">${note}</p>` +
            `<script>window.opener&&window.opener.postMessage({type:"galleo:google-connect",ok:${ok}${detail}},window.location.origin);window.close()</script>`,
    );
}

// Linking from the account page: the session decides which account the identity attaches to, so an
// address that differs from the account's own is fine and can never hand the session to someone else.
async function completeLink(
    c: Context,
    userId: string,
    provider: AuthProvider,
    identity: OAuthIdentity,
): Promise<Response> {
    const result = await linkProviderToUser(userId, provider, identity.sub);
    if (result === "linked-elsewhere")
        return c.redirect(appUrl("/account?authError=oauth_linked_elsewhere"));
    return c.redirect(appUrl(`/account?linked=${provider}`));
}

async function complete(
    c: Context,
    provider: AuthProvider,
    client: Google,
    readIdentity: IdentityReader,
): Promise<Response> {
    const state = c.req.query("state");
    const code = c.req.query("code");
    const storedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    // a link attempt reports back to the account page, a connect to its popup opener, a sign-in
    // to the auth page
    const intent = getCookie(c, INTENT_COOKIE);
    const linking = intent === "link";
    const connecting = intent === "connect";
    const sessionUser = linking || connecting ? readSession(getCookie(c, SESSION_COOKIE)) : null;
    const fail = (code: string): Response =>
        connecting
            ? connectResult(c, false, code)
            : c.redirect(appUrl(`${linking ? "/account" : "/login"}?authError=${code}`));
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    deleteCookie(c, VERIFIER_COOKIE, { path: "/" });
    deleteCookie(c, INTENT_COOKIE, { path: "/" });

    if (!code || !state || !storedState || state !== storedState || !verifier)
        return fail("oauth_state");

    let claims: Record<string, unknown>;
    let grant: { accessToken: string; expiresAt: Date; scopes: string[] } | null = null;
    try {
        const tokens = await client.validateAuthorizationCode(code, verifier);
        claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
        if (connecting) {
            // a missing scope list can't prove the Drive grant, so it stores as none granted
            let scopes: string[] = [];
            try {
                scopes = tokens.scopes();
            } catch {
                scopes = [];
            }
            grant = {
                accessToken: tokens.accessToken(),
                expiresAt: tokens.accessTokenExpiresAt(),
                scopes,
            };
        }
    } catch {
        return fail("oauth_exchange");
    }

    const identity = readIdentity(claims);
    if (!identity) return fail("oauth_email");

    // the session expiring mid-consent must not fall through to a plain sign-in from the popup
    if (connecting) {
        if (!sessionUser || !grant) return fail("oauth_session");
        const linked = await linkProviderToUser(sessionUser, provider, identity.sub);
        if (linked === "linked-elsewhere") return fail("oauth_linked_elsewhere");
        const reconnected = await saveGoogleTokens(sessionUser, grant);
        capture({ userId: sessionUser }, "google_connected", { reconnected });
        return connectResult(c, true);
    }

    // the session expiring mid-consent turns a link into a plain sign-in, never a silent swap
    if (linking && sessionUser) return completeLink(c, sessionUser, provider, identity);

    const result = await linkOAuthAccount(
        provider,
        identity.sub,
        { email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl },
        identity.emailVerified,
    );
    // The provider's (unverified) email already belongs to another account — refuse rather than hijack it.
    if ("error" in result) return fail("oauth_email_taken");
    setSessionCookie(c, result.userId);
    capture({ userId: result.userId }, "logged_in", { method: provider });
    return c.redirect(appUrl("/"));
}

const UNAVAILABLE = "/login?authError=oauth_unavailable";

oauth.get("/auth/providers", (c) => c.json(oauthProvidersReady()));

// ?link=1 comes from the account page's Connect button; without it this is a plain sign-in
oauth.get("/auth/google", (c) => {
    const client = googleProvider();
    if (!client) return c.redirect(appUrl(UNAVAILABLE));
    return begin(c, client, c.req.query("link") === "1" ? "link" : "signin");
});
// The Drive-scope grant, opened as a popup by the export flow; needs a live session to know which
// account the grant lands on, and reports every outcome through the popup page rather than a redirect.
oauth.get("/auth/google/connect", (c) => {
    const client = googleProvider();
    if (!client) return connectResult(c, false, "oauth_unavailable");
    if (!readSession(getCookie(c, SESSION_COOKIE))) return connectResult(c, false, "oauth_session");
    return begin(c, client, "connect");
});
oauth.get("/auth/google/callback", async (c) => {
    const client = googleProvider();
    if (!client) return c.redirect(appUrl(UNAVAILABLE));
    return complete(c, "google", client, googleIdentity);
});
