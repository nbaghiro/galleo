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
    OAUTH_SCOPES,
} from "@services/core/accounts";
import { releaseSignupGrant } from "@services/core/onboarding";

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

function begin(c: Context, client: Google, link: boolean): Response {
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
    if (link) setCookie(c, INTENT_COOKIE, "link", opts);
    else deleteCookie(c, INTENT_COOKIE, { path: "/" });
    return c.redirect(url.toString());
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
    // a link attempt reports back to the account page, a sign-in to the auth page
    const linking = getCookie(c, INTENT_COOKIE) === "link";
    const sessionUser = linking ? readSession(getCookie(c, SESSION_COOKIE)) : null;
    const fail = (code: string): Response =>
        c.redirect(appUrl(`${linking ? "/account" : "/login"}?authError=${code}`));
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    deleteCookie(c, VERIFIER_COOKIE, { path: "/" });
    deleteCookie(c, INTENT_COOKIE, { path: "/" });

    if (!code || !state || !storedState || state !== storedState || !verifier)
        return fail("oauth_state");

    let claims: Record<string, unknown>;
    try {
        const tokens = await client.validateAuthorizationCode(code, verifier);
        claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
    } catch {
        return fail("oauth_exchange");
    }

    const identity = readIdentity(claims);
    if (!identity) return fail("oauth_email");

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
    // An OAuth account lands verified, so this is its verification moment; grantOnce makes a repeat
    // sign-in a no-op, and a failure here must not cost the user their session.
    if (identity.emailVerified) await releaseSignupGrant(result.userId).catch(() => false);
    setSessionCookie(c, result.userId);
    capture({ userId: result.userId }, "logged_in", { method: provider });
    return c.redirect(appUrl("/"));
}

const UNAVAILABLE = "/login?authError=oauth_unavailable";

oauth.get("/auth/providers", (c) => c.json(oauthProvidersReady()));

// ?link=1 comes from the account page's Connect button; without it this is a plain sign-in
oauth.get("/auth/google", (c) => {
    const client = googleProvider();
    return client ? begin(c, client, c.req.query("link") === "1") : c.redirect(appUrl(UNAVAILABLE));
});
oauth.get("/auth/google/callback", async (c) => {
    const client = googleProvider();
    if (!client) return c.redirect(appUrl(UNAVAILABLE));
    return complete(c, "google", client, googleIdentity);
});
