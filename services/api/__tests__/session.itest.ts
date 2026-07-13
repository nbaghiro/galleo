import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../auth";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";

// Integration: the auth entry point against a real Postgres. Real password hashing, real session cookie,
// real SQL — nothing faked.

describe("session routes", () => {
    it("logs in with valid credentials and sets a session cookie", async () => {
        const { email, password } = await seedUser({ password: "hunter2-abcdef" });
        const res = await request("/auth/login", jsonInit("POST", { email, password }));
        expect(res.status).toBe(200);
        expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
        const body = (await res.json()) as { user: { email: string } };
        expect(body.user.email).toBe(email);
    });

    it("normalizes the email on login (case + whitespace)", async () => {
        const { email, password } = await seedUser();
        const res = await request(
            "/auth/login",
            jsonInit("POST", { email: `  ${email.toUpperCase()} `, password }),
        );
        expect(res.status).toBe(200);
    });

    it("rejects a wrong password with 401", async () => {
        const { email } = await seedUser({ password: "correct-horse-battery" });
        const res = await request("/auth/login", jsonInit("POST", { email, password: "nope" }));
        expect(res.status).toBe(401);
    });

    it("400s when email or password is missing", async () => {
        const res = await request("/auth/login", jsonInit("POST", { email: "x@y.z" }));
        expect(res.status).toBe(400);
    });

    it("GET /me returns the user for an authed request, 401 without a session", async () => {
        const { userId, email } = await seedUser();
        const ok = await authed(userId, "/me");
        expect(ok.status).toBe(200);
        expect(((await ok.json()) as { user: { email: string } }).user.email).toBe(email);

        const anon = await request("/me");
        expect(anon.status).toBe(401);
    });
});
