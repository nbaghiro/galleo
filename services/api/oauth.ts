import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { generateState, generateCodeVerifier, decodeIdToken } from "arctic";
import type { Google, MicrosoftEntraId } from "arctic";
import type { AuthProvider } from "@model/workspace";
import { linkOAuthAccount } from "../provision";
import { googleProvider, microsoftProvider, oauthProvidersReady, OAUTH_SCOPES } from "../oauth";
import { appUrl } from "../app-url";
import { setSessionCookie } from "./context";

// OAuth sign-in for Google + Microsoft. Standard two-leg flow (begin → provider → callback); only the
// per-provider identity read differs — Google asserts email_verified, Microsoft can't (see below).
// Failures redirect to /login?authError=<code> for the auth page to explain.
export const oauth = new Hono();

// Both arctic clients expose the methods a route uses, so one handler serves either.
type OAuthClient = Google | MicrosoftEntraId;

const STATE_COOKIE = "oauth_state";
const VERIFIER_COOKIE = "oauth_verifier";
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

// Microsoft Entra (`common`) id_tokens carry no `email_verified`, and email/preferred_username are
// tenant-mutable, so we mark the identity UNVERIFIED — fine for a fresh sign-in, but linkOAuthAccount
// won't merge it into an existing account (nOAuth). `email` may be absent; fall back to preferred_username.
const microsoftIdentity: IdentityReader = (claims) => {
    const sub = claim(claims, "sub");
    const email = claim(claims, "email") ?? claim(claims, "preferred_username");
    if (!sub || !email) return null;
    return { sub, email, emailVerified: false, name: claim(claims, "name"), avatarUrl: null };
};

// Redirect leg: stash state + PKCE in cookies, bounce to the provider.
function begin(c: Context, client: OAuthClient): Response {
    const state = generateState();
    const verifier = generateCodeVerifier();
    const url = client.createAuthorizationURL(state, verifier, OAUTH_SCOPES);
    const opts = {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TEMP_MAX_AGE,
    } as const;
    setCookie(c, STATE_COOKIE, state, opts);
    setCookie(c, VERIFIER_COOKIE, verifier, opts);
    return c.redirect(url.toString());
}

// Callback leg: verify state, exchange the code, resolve the identity to a user, sign in.
async function complete(
    c: Context,
    provider: AuthProvider,
    client: OAuthClient,
    readIdentity: IdentityReader,
): Promise<Response> {
    const state = c.req.query("state");
    const code = c.req.query("code");
    const storedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    deleteCookie(c, VERIFIER_COOKIE, { path: "/" });

    if (!code || !state || !storedState || state !== storedState || !verifier)
        return c.redirect(appUrl("/login?authError=oauth_state"));

    let claims: Record<string, unknown>;
    try {
        const tokens = await client.validateAuthorizationCode(code, verifier);
        claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
    } catch {
        return c.redirect(appUrl("/login?authError=oauth_exchange"));
    }

    const identity = readIdentity(claims);
    if (!identity) return c.redirect(appUrl("/login?authError=oauth_email"));

    const result = await linkOAuthAccount(
        provider,
        identity.sub,
        { email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl },
        identity.emailVerified,
    );
    // The provider's (unverified) email already belongs to another account — refuse rather than hijack it.
    if ("error" in result) return c.redirect(appUrl("/login?authError=oauth_email_taken"));
    setSessionCookie(c, result.userId);
    return c.redirect(appUrl("/"));
}

const UNAVAILABLE = "/login?authError=oauth_unavailable";

oauth.get("/auth/providers", (c) => c.json(oauthProvidersReady()));

oauth.get("/auth/google", (c) => {
    const client = googleProvider();
    return client ? begin(c, client) : c.redirect(appUrl(UNAVAILABLE));
});
oauth.get("/auth/google/callback", async (c) => {
    const client = googleProvider();
    if (!client) return c.redirect(appUrl(UNAVAILABLE));
    return complete(c, "google", client, googleIdentity);
});

oauth.get("/auth/microsoft", (c) => {
    const client = microsoftProvider();
    return client ? begin(c, client) : c.redirect(appUrl(UNAVAILABLE));
});
oauth.get("/auth/microsoft/callback", async (c) => {
    const client = microsoftProvider();
    if (!client) return c.redirect(appUrl(UNAVAILABLE));
    return complete(c, "microsoft", client, microsoftIdentity);
});
