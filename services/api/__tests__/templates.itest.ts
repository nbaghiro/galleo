import { describe, expect, it } from "vitest";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";

describe("template popularity", () => {
    it("counts creates that carry a templateId, and ignores made-up ids", async () => {
        const { userId } = await seedUser();
        const make = (templateId: string) =>
            authed(
                userId,
                "/artifacts",
                jsonInit("POST", { title: "T", formatId: "deck", themeId: "studio", templateId }),
            );
        expect((await make("sales-deck")).status).toBe(200);
        expect((await make("sales-deck")).status).toBe(200);
        expect((await make("landing-page")).status).toBe(200);
        expect((await make("not-a-template")).status).toBe(200); // create works, tally skips it

        const res = await authed(userId, "/templates");
        const { uses } = (await res.json()) as { uses: Record<string, number> };
        expect(uses["sales-deck"]).toBe(2);
        expect(uses["landing-page"]).toBe(1);
        expect(uses["not-a-template"]).toBeUndefined();
    });
});

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
