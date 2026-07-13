import { describe, expect, it } from "vitest";
import { authed, request, seedUser } from "../../__tests__/harness";

describe("templates — read-only catalog", () => {
    it("returns the seeded template catalog to an authed user", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/templates");
        expect(res.status).toBe(200);
        const { templates } = (await res.json()) as {
            templates: { id: string; name: string; category: string; content: unknown }[];
        };
        expect(templates.length).toBeGreaterThan(0);
        const first = templates[0]!;
        expect(first.id).toBeTruthy();
        expect(first.name).toBeTruthy();
        expect(first.content).toBeTruthy(); // the artifact tree the client clones
    });

    it("401s without a session", async () => {
        expect((await request("/templates")).status).toBe(401);
    });
});
