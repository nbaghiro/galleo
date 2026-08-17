import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Embedder } from "@services/core/ai/embed";
import { addTextItem } from "@services/core/context";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";

// The item-ingestion routes gate on embeddingReady(); clear the key so the 503 branch is the real
// one (core ingestion itself is covered by context.itest.ts with an injected embedder).
let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = savedKey;
});

const fakeEmbed: Embedder = (texts) =>
    Promise.resolve(
        texts.map(() => {
            const v = new Array<number>(768).fill(0);
            v[0] = 1;
            return v;
        }),
    );

interface ContextsBody {
    contexts: { id: string; name: string; description: string | null; items: number }[];
}
interface ItemsBody {
    items: { id: string; kind: string; title: string; original: boolean }[];
}
interface ErrorBody {
    error: string;
}

const NO_SUCH = "11111111-2222-3333-4444-555555555555";

const createCtx = async (userId: string, name = "Research"): Promise<string> => {
    const res = await authed(userId, "/contexts", jsonInit("POST", { name }));
    return ((await res.json()) as { id: string }).id;
};

const listCtx = async (userId: string): Promise<ContextsBody["contexts"]> => {
    const res = await authed(userId, "/contexts");
    return ((await res.json()) as ContextsBody).contexts;
};

describe("context CRUD routes", () => {
    it("lists only the workspace's own contexts", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        await createCtx(mine.userId, "Mine");
        await createCtx(theirs.userId, "Theirs");

        const names = (await listCtx(mine.userId)).map((c) => c.name);
        expect(names).toEqual(["Mine"]);
        expect((await request("/contexts")).status).toBe(401);
    });

    it("requires a name on create, then trims and caps it at 120 characters", async () => {
        const { userId } = await seedUser();
        expect((await authed(userId, "/contexts", jsonInit("POST", {}))).status).toBe(400);
        expect((await authed(userId, "/contexts", jsonInit("POST", { name: "   " }))).status).toBe(
            400,
        );

        await authed(
            userId,
            "/contexts",
            jsonInit("POST", { name: `  ${"n".repeat(150)}  `, description: " why " }),
        );
        const [ctx] = await listCtx(userId);
        expect(ctx!.name).toHaveLength(120);
        expect(ctx!.description).toBe("why");
    });

    it("404s reads of a foreign or unknown context", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const foreignId = await createCtx(theirs.userId);

        expect((await authed(mine.userId, `/contexts/${foreignId}`)).status).toBe(404);
        expect((await authed(mine.userId, `/contexts/${NO_SUCH}`)).status).toBe(404);
        expect((await authed(mine.userId, "/contexts/not-a-uuid")).status).toBe(404);
    });

    it("patches name and description, refuses an empty patch, scopes to the tenant", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await createCtx(mine.userId, "Before");

        expect((await authed(mine.userId, `/contexts/${id}`, jsonInit("PATCH", {}))).status).toBe(
            400,
        );
        const res = await authed(
            mine.userId,
            `/contexts/${id}`,
            jsonInit("PATCH", { name: "After" }),
        );
        expect(await res.json()).toEqual({ ok: true });
        expect((await listCtx(mine.userId))[0]!.name).toBe("After");

        expect(
            (await authed(theirs.userId, `/contexts/${id}`, jsonInit("PATCH", { name: "Stolen" })))
                .status,
        ).toBe(404);
        expect((await listCtx(mine.userId))[0]!.name).toBe("After");
    });

    it("deletes only its own context", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await createCtx(mine.userId);

        expect(
            (await authed(theirs.userId, `/contexts/${id}`, jsonInit("DELETE", {}))).status,
        ).toBe(404);
        expect(
            await (await authed(mine.userId, `/contexts/${id}`, jsonInit("DELETE", {}))).json(),
        ).toEqual({ ok: true });
        expect(await listCtx(mine.userId)).toEqual([]);
    });
});

describe("item ingestion gate", () => {
    it("503s adds and re-syncs while the embedding model is unconfigured", async () => {
        const { userId } = await seedUser();
        const id = await createCtx(userId);

        const add = await authed(
            userId,
            `/contexts/${id}/items`,
            jsonInit("POST", { kind: "text", body: "hello" }),
        );
        expect(add.status).toBe(503);
        expect(((await add.json()) as ErrorBody).error).toContain("isn't configured");

        const resync = await authed(
            userId,
            `/contexts/${id}/items/${NO_SUCH}/resync`,
            jsonInit("POST", {}),
        );
        expect(resync.status).toBe(503);
    });
});

describe("item reads over stored sources", () => {
    it("serves the stored original byte-for-byte with its mime, and the text snapshot", async () => {
        const { userId, workspaceId } = await seedUser();
        const ctxId = await createCtx(userId);
        const pdf = Buffer.from("%PDF-1.4 fake body bytes");
        const item = await addTextItem(
            workspaceId,
            ctxId,
            userId,
            "file",
            "Q3 report",
            "meridian findings",
            fakeEmbed,
            { data: pdf.toString("base64"), mime: "application/pdf" },
        );

        const orig = await authed(userId, `/contexts/${ctxId}/items/${item.id}/original`);
        expect(orig.status).toBe(200);
        expect(orig.headers.get("content-type")).toBe("application/pdf");
        expect(orig.headers.get("cache-control")).toBe("private, max-age=3600");
        expect(Buffer.from(await orig.arrayBuffer()).equals(pdf)).toBe(true);

        const snap = await authed(userId, `/contexts/${ctxId}/items/${item.id}/snapshot`);
        expect(await snap.json()).toEqual({ body: "meridian findings" });

        const { items } = (await (await authed(userId, `/contexts/${ctxId}`)).json()) as ItemsBody;
        expect(items).toHaveLength(1);
        expect(items[0]!.original).toBe(true);
    });

    it("404s the original of an item that has none, and any unknown item", async () => {
        const { userId, workspaceId } = await seedUser();
        const ctxId = await createCtx(userId);
        const item = await addTextItem(
            workspaceId,
            ctxId,
            userId,
            "text",
            "Pasted text",
            "just words",
            fakeEmbed,
        );

        const orig = await authed(userId, `/contexts/${ctxId}/items/${item.id}/original`);
        expect(orig.status).toBe(404);
        expect(((await orig.json()) as ErrorBody).error).toContain("no original");
        expect((await authed(userId, `/contexts/${ctxId}/items/${NO_SUCH}/snapshot`)).status).toBe(
            404,
        );
    });

    it("never serves another workspace's items", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const ctxId = await createCtx(mine.userId);
        const item = await addTextItem(
            mine.workspaceId,
            ctxId,
            mine.userId,
            "text",
            "Secret",
            "meridian secret",
            fakeEmbed,
        );

        expect(
            (await authed(theirs.userId, `/contexts/${ctxId}/items/${item.id}/snapshot`)).status,
        ).toBe(404);
        expect(
            (await authed(theirs.userId, `/contexts/${ctxId}/items/${item.id}/original`)).status,
        ).toBe(404);
    });

    it("removes an item over the route, after which its reads 404", async () => {
        const { userId, workspaceId } = await seedUser();
        const ctxId = await createCtx(userId);
        const item = await addTextItem(
            workspaceId,
            ctxId,
            userId,
            "text",
            "Doomed",
            "soon gone",
            fakeEmbed,
        );

        const res = await authed(
            userId,
            `/contexts/${ctxId}/items/${item.id}`,
            jsonInit("DELETE", {}),
        );
        expect(await res.json()).toEqual({ ok: true });
        expect((await authed(userId, `/contexts/${ctxId}/items/${item.id}/snapshot`)).status).toBe(
            404,
        );
        const { items } = (await (await authed(userId, `/contexts/${ctxId}`)).json()) as ItemsBody;
        expect(items).toEqual([]);
    });
});
