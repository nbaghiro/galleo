import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { SESSION_COOKIE, makeSession } from "@services/utils/auth";
import { request, seedUser } from "@services/__tests__/harness";

// Mocked at the package boundary: the provider round-trip is the external oracle. The route's own
// state/intent/session logic, and every row it writes, run for real.
const arctic = vi.hoisted(() => ({
    claims: {} as Record<string, unknown>,
}));

vi.mock("arctic", () => ({
    generateState: () => "test-state",
    generateCodeVerifier: () => "test-verifier",
    decodeIdToken: () => arctic.claims,
    Google: vi.fn(function GoogleCtor() {
        return {
            createAuthorizationURL: () => new URL("https://accounts.google.com/o/oauth2/v2/auth"),
            validateAuthorizationCode: () => Promise.resolve({ idToken: () => "id-token" }),
        };
    }),
}));

const CALLBACK = "/auth/google/callback?code=auth-code&state=test-state";

const cookies = (parts: Record<string, string>): string =>
    Object.entries(parts)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");

const flowCookies = { oauth_state: "test-state", oauth_verifier: "test-verifier" };

const identify = (sub: string, email: string): void => {
    arctic.claims = { sub, email, email_verified: true, name: "Linked User", picture: null };
};

const linksOf = (userId: string) =>
    db.select().from(schema.oauthAccounts).where(eq(schema.oauthAccounts.userId, userId));

describe("oauth link flow", () => {
    beforeAll(() => {
        vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client");
        vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret");
    });

    beforeEach(() => {
        identify("google-sub-1", "someone@gmail.com");
    });

    it("marks the intent only when the start carries ?link=1", async () => {
        const linking = await request("/auth/google?link=1");
        expect(linking.headers.get("set-cookie")).toContain("oauth_intent=link");

        const signIn = await request("/auth/google");
        const set = signIn.headers.get("set-cookie") ?? "";
        expect(set).toContain("oauth_state=test-state");
        expect(set).not.toContain("oauth_intent=link");
    });

    it("links the identity to the session's account, not to whichever account owns that email", async () => {
        const me = await seedUser();
        const other = await seedUser();
        identify("google-sub-1", other.email); // the provider's address belongs to someone else

        const res = await request(CALLBACK, {
            headers: {
                Cookie: cookies({
                    ...flowCookies,
                    oauth_intent: "link",
                    [SESSION_COOKIE]: makeSession(me.userId),
                }),
            },
        });
        expect(res.headers.get("location")).toContain("/account?linked=google");
        // no session swap: the link path never re-issues the cookie
        expect(res.headers.get("set-cookie") ?? "").not.toContain(`${SESSION_COOKIE}=e`);
        expect(await linksOf(me.userId)).toHaveLength(1);
        expect(await linksOf(other.userId)).toHaveLength(0);
    });

    it("refuses a provider account that is already linked elsewhere", async () => {
        const me = await seedUser();
        const other = await seedUser();
        await db.insert(schema.oauthAccounts).values({
            userId: other.userId,
            provider: "google",
            providerAccountId: "google-sub-1",
        });

        const res = await request(CALLBACK, {
            headers: {
                Cookie: cookies({
                    ...flowCookies,
                    oauth_intent: "link",
                    [SESSION_COOKIE]: makeSession(me.userId),
                }),
            },
        });
        expect(res.headers.get("location")).toContain("/account?authError=oauth_linked_elsewhere");
        expect(await linksOf(me.userId)).toHaveLength(0);
    });

    it("is idempotent when the same identity is linked twice", async () => {
        const me = await seedUser();
        const headers = {
            Cookie: cookies({
                ...flowCookies,
                oauth_intent: "link",
                [SESSION_COOKIE]: makeSession(me.userId),
            }),
        };
        await request(CALLBACK, { headers });
        const again = await request(CALLBACK, { headers });
        expect(again.headers.get("location")).toContain("/account?linked=google");
        expect(await linksOf(me.userId)).toHaveLength(1);
    });

    it("falls back to a plain sign-in when the session expired mid-consent", async () => {
        const existing = await seedUser();
        identify("google-sub-1", existing.email);
        await db
            .update(schema.users)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(schema.users.id, existing.userId));

        const res = await request(CALLBACK, {
            headers: { Cookie: cookies({ ...flowCookies, oauth_intent: "link" }) },
        });
        expect(res.headers.get("location")).toBe("http://localhost:8600/");
        expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    });

    it("reports a failed link on the account page, and a failed sign-in on the auth page", async () => {
        const me = await seedUser();
        const bad = { ...flowCookies, oauth_state: "mismatched" };

        const linking = await request(CALLBACK, {
            headers: {
                Cookie: cookies({
                    ...bad,
                    oauth_intent: "link",
                    [SESSION_COOKIE]: makeSession(me.userId),
                }),
            },
        });
        expect(linking.headers.get("location")).toContain("/account?authError=oauth_state");

        const signIn = await request(CALLBACK, { headers: { Cookie: cookies(bad) } });
        expect(signIn.headers.get("location")).toContain("/login?authError=oauth_state");
    });

    it("still signs in by email when no link was intended", async () => {
        const res = await request(CALLBACK, { headers: { Cookie: cookies(flowCookies) } });
        expect(res.headers.get("location")).toBe("http://localhost:8600/");
        const [created] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, "someone@gmail.com"));
        expect(created).toBeDefined();
        const [link] = await db
            .select()
            .from(schema.oauthAccounts)
            .where(
                and(
                    eq(schema.oauthAccounts.userId, created!.id),
                    eq(schema.oauthAccounts.provider, "google"),
                ),
            );
        expect(link?.providerAccountId).toBe("google-sub-1");
    });
});
