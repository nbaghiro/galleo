import { describe, expect, it } from "vitest";
import { authed, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";
import { hashPassword, makeSession, SESSION_COOKIE } from "../../auth";

interface FeaturesBody {
    features: {
        publicLinks: boolean;
        customThemes: boolean;
        removeBranding: boolean;
        maxArtifacts: number;
        creditsPerMonth: number;
    };
    status: Record<string, string>;
}

describe("features — resolved feature set per plan", () => {
    it("projects the free plan's grants and limits", async () => {
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/features");
        expect(res.status).toBe(200);
        const { features } = (await res.json()) as FeaturesBody;
        expect(features.publicLinks).toBe(false);
        expect(features.customThemes).toBe(false);
        expect(features.removeBranding).toBe(false);
        expect(features.maxArtifacts).toBe(10);
    });

    it("projects the pro plan's grants and unlimited artifacts", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/features");
        const { features, status } = (await res.json()) as FeaturesBody;
        expect(features.publicLinks).toBe(true);
        expect(features.customThemes).toBe(true);
        expect(features.removeBranding).toBe(true);
        expect(features.maxArtifacts).toBe(-1); // unlimited
        expect(features.creditsPerMonth).toBeGreaterThan(0);
        // the status map carries each feature's rollout stage
        expect(status.publicLinks).toBe("live");
    });

    it("401s without a session", async () => {
        expect((await request("/features")).status).toBe(401);
    });

    it("400s for a user with no workspace", async () => {
        const [u] = await db
            .insert(schema.users)
            .values({ email: "lonely@test.local", passwordHash: hashPassword("pw-12345678") })
            .returning({ id: schema.users.id });
        const res = await request("/features", {
            headers: { Cookie: `${SESSION_COOKIE}=${makeSession(u!.id)}` },
        });
        expect(res.status).toBe(400);
    });
});
