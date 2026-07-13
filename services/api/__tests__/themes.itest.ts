import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_THEME } from "@themes";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

const TOKENS = DEFAULT_THEME.tokens;

describe("themes — list (workspace-scoped only)", () => {
    it("returns only the workspace's themes, never system (null-workspace) rows", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await db.insert(schema.themes).values([
            { workspaceId: null, name: "System", tokens: TOKENS }, // built-in — must be hidden
            { workspaceId, name: "Mine", tokens: TOKENS, mood: "bold", isDark: true },
        ]);

        const res = await authed(userId, "/themes");
        expect(res.status).toBe(200);
        const { themes } = (await res.json()) as {
            themes: { name: string; mood: string | null; isDark: boolean }[];
        };
        expect(themes).toHaveLength(1);
        expect(themes[0]!.name).toBe("Mine");
        expect(themes[0]!.mood).toBe("bold");
        expect(themes[0]!.isDark).toBe(true);
    });

    it("401s without a session", async () => {
        expect((await request("/themes")).status).toBe(401);
    });
});

describe("themes — create (gated on customThemes)", () => {
    it("blocks a plan without custom themes (402, upgrade:true)", async () => {
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/themes", jsonInit("POST", { tokens: TOKENS }));
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });

    it("400s when tokens are missing", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/themes", jsonInit("POST", { name: "No tokens" }));
        expect(res.status).toBe(400);
    });

    it("creates a workspace theme and persists it under the workspace", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const res = await authed(
            userId,
            "/themes",
            jsonInit("POST", { name: "Brand", tokens: TOKENS, mood: "warm", isDark: false }),
        );
        expect(res.status).toBe(200);
        const { theme } = (await res.json()) as { theme: { id: string; name: string } };
        expect(theme.name).toBe("Brand");

        const [row] = await db.select().from(schema.themes).where(eq(schema.themes.id, theme.id));
        expect(row!.workspaceId).toBe(workspaceId);
        expect(row!.mood).toBe("warm");
    });

    it("falls back to a default name when the name is blank", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(
            userId,
            "/themes",
            jsonInit("POST", { name: "   ", tokens: TOKENS }),
        );
        expect(res.status).toBe(200);
        const { theme } = (await res.json()) as { theme: { name: string } };
        expect(theme.name).toBe("Custom theme");
    });
});

describe("themes — update / delete (tenant-scoped)", () => {
    async function makeTheme(workspaceId: string, name = "Theme"): Promise<string> {
        const [t] = await db
            .insert(schema.themes)
            .values({ workspaceId, name, tokens: TOKENS })
            .returning({ id: schema.themes.id });
        return t!.id;
    }

    it("updates only the provided fields", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await makeTheme(workspaceId, "Old");
        const res = await authed(userId, `/themes/${id}`, jsonInit("PATCH", { name: "New" }));
        expect(res.status).toBe(200);
        const { theme } = (await res.json()) as { theme: { name: string } };
        expect(theme.name).toBe("New");
    });

    it("404s when updating a theme owned by another workspace", async () => {
        const owner = await seedUser({ plan: "pro" });
        const stranger = await seedUser({ plan: "pro" });
        const id = await makeTheme(owner.workspaceId);
        const res = await authed(
            stranger.userId,
            `/themes/${id}`,
            jsonInit("PATCH", { name: "X" }),
        );
        expect(res.status).toBe(404);
    });

    it("deletes the workspace's own theme", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await makeTheme(workspaceId);
        const res = await authed(userId, `/themes/${id}`, jsonInit("DELETE", {}));
        expect(res.status).toBe(200);
        const rows = await db.select().from(schema.themes).where(eq(schema.themes.id, id));
        expect(rows).toHaveLength(0);
    });

    it("never deletes another workspace's theme (scoped delete is a no-op)", async () => {
        const owner = await seedUser({ plan: "pro" });
        const stranger = await seedUser({ plan: "pro" });
        const id = await makeTheme(owner.workspaceId);
        const res = await authed(stranger.userId, `/themes/${id}`, jsonInit("DELETE", {}));
        expect(res.status).toBe(200); // scoped delete reports ok even when it matched nothing
        const rows = await db.select().from(schema.themes).where(eq(schema.themes.id, id));
        expect(rows).toHaveLength(1); // owner's theme untouched
    });
});
