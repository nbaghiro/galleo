import { describe, expect, it } from "vitest";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { storeUpload } from "@services/core/media";
import { app, seedUser } from "@services/__tests__/harness";

// eight bytes, so every boundary below is checkable by eye
const BYTES = Buffer.from("0123456789abcdef", "utf8");
const B64 = BYTES.toString("base64");

const asset = async (): Promise<string> => {
    const { workspaceId } = await seedUser();
    const item = await storeUpload(workspaceId, { data: B64, mime: "video/mp4" });
    return item.id;
};

const get = async (id: string, range?: string): Promise<Response> =>
    app.request(`/media/asset/${id}`, { headers: range ? { range } : {} });

describe("serving stored media", () => {
    it("advertises range support, which is what lets a player seek", async () => {
        const res = await get(await asset());
        expect(res.status).toBe(200);
        expect(res.headers.get("accept-ranges")).toBe("bytes");
        expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES);
    });

    it("answers a range with exactly that slice", async () => {
        const res = await get(await asset(), "bytes=4-7");
        expect(res.status).toBe(206);
        expect(res.headers.get("content-range")).toBe(`bytes 4-7/${BYTES.length}`);
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("4567");
    });

    it("reads an open-ended range to the last byte", async () => {
        const res = await get(await asset(), "bytes=10-");
        expect(res.status).toBe(206);
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("abcdef");
    });

    it("reads a suffix range as the last N bytes", async () => {
        const res = await get(await asset(), "bytes=-4");
        expect(res.status).toBe(206);
        expect(res.headers.get("content-range")).toBe(`bytes 12-15/${BYTES.length}`);
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("cdef");
    });

    it("clamps an end past the file rather than failing", async () => {
        const res = await get(await asset(), "bytes=12-999");
        expect(res.status).toBe(206);
        expect(res.headers.get("content-range")).toBe(`bytes 12-15/${BYTES.length}`);
    });

    it("refuses a start past the file, and says how long it is", async () => {
        const res = await get(await asset(), "bytes=99-");
        expect(res.status).toBe(416);
        expect(res.headers.get("content-range")).toBe(`bytes */${BYTES.length}`);
    });

    it("ignores a header it does not understand and serves the whole thing", async () => {
        for (const bad of ["bytes=", "items=0-1", "bytes=abc-def", "nonsense"]) {
            const res = await get(await asset(), bad);
            expect(res.status).toBe(200);
        }
    });

    it("does not claim range support for a redirect to a provider", async () => {
        const { workspaceId } = await seedUser();
        const [row] = await db
            .insert(schema.assets)
            .values({
                workspaceId,
                kind: "image",
                source: "stock",
                origin: "https://cdn.example/photo.jpg",
            })
            .returning();
        const res = await app.request(`/media/asset/${row!.id}`, {
            headers: { range: "bytes=0-9" },
        });
        expect(res.status).toBe(302);
    });

    it("lets the browser reuse the redirect, briefly for an origin that expires", async () => {
        const { workspaceId } = await seedUser();
        const mk = async (origin: string): Promise<string> => {
            const [row] = await db
                .insert(schema.assets)
                .values({ workspaceId, kind: "image", source: "stock", origin })
                .returning();
            return row!.id;
        };
        const stable = await app.request(
            `/media/asset/${await mk("https://images.pexels.com/photos/1/a.jpg")}`,
        );
        expect(stable.headers.get("cache-control")).toBe("public, max-age=86400");
        const expiring = await app.request(
            `/media/asset/${await mk("https://pixabay.com/get/b.jpg")}`,
        );
        expect(expiring.headers.get("cache-control")).toBe("public, max-age=3600");
    });
});
