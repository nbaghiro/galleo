import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { mediaRefs } from "@model/artifact";
import { assetIdFromUrl } from "@model/media";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    applyContentOps,
    createArtifact,
    readArtifact,
    updateArtifact,
} from "@services/core/artifacts";
import {
    artifactCredits,
    deleteAsset,
    libraryAssets,
    storeGenerated,
    storeUpload,
    useItem,
} from "@services/core/media";
import { seedUser } from "@services/__tests__/harness";

const image = (src: string) => ({ type: "image", data: { src } });

const content = (...urls: string[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: { type: "group", data: { children: urls.map(image) } },
        },
    ],
});

const storedRefs = async (workspaceId: string, id: string): Promise<string[]> =>
    mediaRefs((await readArtifact(workspaceId, id))!.draftContent);

const indexed = async (id: string): Promise<string[]> =>
    (
        await db
            .select({ assetId: schema.artifactAssets.assetId })
            .from(schema.artifactAssets)
            .where(eq(schema.artifactAssets.artifactId, id))
    ).map((r) => r.assetId);

describe("every media url in an artifact is an asset", () => {
    it("holds on create, and indexes what it referenced", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, {
            draftContent: content("https://images.unsplash.com/a.jpg", "https://x.example/b.png"),
        }))!;

        const refs = await storedRefs(workspaceId, id);
        expect(refs).toHaveLength(2);
        for (const url of refs) expect(assetIdFromUrl(url)).toBeTruthy();
        expect((await indexed(id)).sort()).toEqual(refs.map((u) => assetIdFromUrl(u)!).sort());
    });

    it("holds on a whole-document save", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, { draftContent: content() }))!;
        await updateArtifact(workspaceId, id, {
            draftContent: content("https://cdn.example/late.jpg"),
        });
        expect(assetIdFromUrl((await storedRefs(workspaceId, id))[0])).toBeTruthy();
    });

    it("holds on a section-op write, the path autosave takes", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, { draftContent: content() }))!;
        const res = await applyContentOps(
            workspaceId,
            id,
            [
                {
                    kind: "insert",
                    index: 1,
                    section: {
                        id: "s2",
                        root: {
                            type: "group",
                            data: { children: [image("https://cdn.example/op.jpg")] },
                        },
                    },
                },
            ],
            {},
        );
        expect(res.status).toBe(200);
        const refs = await storedRefs(workspaceId, id);
        expect(refs).toHaveLength(1);
        expect(assetIdFromUrl(refs[0])).toBeTruthy();
        expect(await indexed(id)).toHaveLength(1);
    });

    it("carries the canonical url into the derived cover, so the library thumbnail resolves", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, {
            draftContent: content("https://cdn.example/cover.jpg"),
        }))!;
        const row = await readArtifact(workspaceId, id);
        expect(assetIdFromUrl(row!.digest!.cover.image!)).toBeTruthy();
    });

    it("re-saving unchanged content adopts nothing new", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, {
            draftContent: content("https://cdn.example/once.jpg"),
        }))!;
        const stored = (await readArtifact(workspaceId, id))!.draftContent as ArtifactContent;
        await updateArtifact(workspaceId, id, { draftContent: stored });
        const rows = await db
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
    });

    it("refuses to delete an asset a deck still shows, and names it", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, {
            title: "Q3 deck",
            draftContent: content("https://cdn.example/in-use.jpg"),
        }))!;
        const [assetId] = await indexed(id);

        const blocked = await deleteAsset(workspaceId, assetId!);
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) expect(blocked.usedBy.map((a) => a.title)).toEqual(["Q3 deck"]);

        // once nothing points at it, it goes
        await updateArtifact(workspaceId, id, { draftContent: content() });
        expect((await deleteAsset(workspaceId, assetId!)).ok).toBe(true);
    });

    it("finds media by what it shows and by the prompt it came from", async () => {
        const { workspaceId } = await seedUser();
        await storeUpload(workspaceId, { data: "aGVsbG8=", mime: "image/png", name: "ridge.png" });
        await storeGenerated(
            workspaceId,
            "image",
            { dataBase64: "d29ybGQ=", mime: "image/png", width: 8, height: 8 },
            "a quiet harbour at dawn",
        );
        expect((await libraryAssets(workspaceId, { q: "ridge" })).items).toHaveLength(1);
        expect((await libraryAssets(workspaceId, { q: "harbour" })).items).toHaveLength(1);
        expect((await libraryAssets(workspaceId, { q: "nothing" })).items).toHaveLength(0);
    });

    it("credits the photographers behind the pictures it uses, once each", async () => {
        const { userId, workspaceId } = await seedUser();
        const shot = await useItem(workspaceId, {
            id: "unsplash-1",
            source: "stock",
            url: "https://images.unsplash.com/photo-credit.jpg",
            thumbUrl: "https://images.unsplash.com/photo-credit.jpg?w=400",
            width: 1200,
            height: 800,
            attribution: {
                provider: "Unsplash",
                author: "Anna Reyes",
                authorUrl: "https://unsplash.com/@areyes",
            },
        });
        const id = (await createArtifact(workspaceId, userId, {
            // the same photo twice, plus one nobody needs crediting for
            draftContent: content(shot.url, shot.url, "https://picsum.photos/seed/x/800/600"),
        }))!;

        expect(await artifactCredits(id)).toEqual([
            {
                provider: "Unsplash",
                author: "Anna Reyes",
                authorUrl: "https://unsplash.com/@areyes",
                sourceUrl: undefined,
            },
        ]);
    });

    it("drops the reverse index when the artifact goes", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = (await createArtifact(workspaceId, userId, {
            draftContent: content("https://cdn.example/gone.jpg"),
        }))!;
        expect(await indexed(id)).toHaveLength(1);
        await db.delete(schema.artifacts).where(eq(schema.artifacts.id, id));
        expect(await indexed(id)).toHaveLength(0);
    });
});
