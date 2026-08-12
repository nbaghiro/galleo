import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { seedUser } from "../../__tests__/harness";
import { db } from "../../db/client";
import { schema } from "../../db/schema";
import type { Embedder } from "../ai/embed";
import {
    addArtifactItem,
    addTemplateItem,
    addTextItem,
    createContext,
    deleteContext,
    getContextItems,
    getItemBody,
    listContexts,
    makeContextRetriever,
    recallConversation,
    recordChatExchange,
    removeItem,
    resyncItem,
    retrieveContext,
    updateContext,
} from "../context";

// Keyword-axis embedder: texts sharing a keyword land on the same axis (distance 0), everything
// else is orthogonal — deterministic ranking with no model call.
const AXES = ["meridian", "heron", "anvil"];
const fakeEmbed: Embedder = (texts) =>
    Promise.resolve(
        texts.map((t) => {
            const v = new Array<number>(768).fill(0);
            const low = t.toLowerCase();
            AXES.forEach((word, i) => {
                if (low.includes(word)) v[i] = 1;
            });
            if (!v.some(Boolean)) v[767] = 1;
            return v;
        }),
    );

const chunkRows = (refId: string) =>
    db.select().from(schema.chunks).where(eq(schema.chunks.refId, refId));

const seedArtifact = async (workspaceId: string, title: string, text: string): Promise<string> => {
    const [row] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title,
            formatId: "deck",
            themeId: "studio",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [
                    {
                        id: "s1",
                        root: {
                            type: "group",
                            data: {
                                direction: "col",
                                children: [{ type: "text", data: { text } }],
                            },
                        },
                    },
                ],
            },
        })
        .returning({ id: schema.artifacts.id });
    return row!.id;
};

describe("context library", () => {
    it("ingests text and artifact sources into scoped, ordered chunks", async () => {
        const { userId, workspaceId } = await seedUser();
        const { id: ctx } = await createContext(workspaceId, userId, "Board pack");

        const body = `${"meridian revenue grew. ".repeat(80)}\n\n${"the harbor expanded. ".repeat(80)}`;
        const item = await addTextItem(
            workspaceId,
            ctx,
            userId,
            "file",
            "Q3 notes",
            body,
            fakeEmbed,
        );
        const rows = await chunkRows(item.id);
        expect(rows.length).toBeGreaterThan(1);
        expect(rows.every((r) => r.scope === "context" && r.workspaceId === workspaceId)).toBe(
            true,
        );
        expect(new Set(rows.map((r) => r.seq)).size).toBe(rows.length);

        const artifactId = await seedArtifact(workspaceId, "Old deck", "The heron mascot debuted.");
        const art = await addArtifactItem(workspaceId, ctx, userId, artifactId, fakeEmbed);
        expect(art.kind).toBe("artifact");
        expect(art.ref).toBe(artifactId);
        const artChunks = await chunkRows(art.id);
        expect(artChunks).toHaveLength(1);
        // the artifact's body carries its title and its section text
        expect(artChunks[0]!.text).toContain("Old deck");
        expect(artChunks[0]!.text).toContain("heron mascot");

        const [summary] = await listContexts(workspaceId);
        expect(summary!.items).toBe(2);
        // the list card's constellation: one chunk count per source (order-free — inserts can tie)
        expect([...summary!.clusters].sort((a, b) => a - b)).toEqual(
            [1, rows.length].sort((a, b) => a - b),
        );
        const metas = await getContextItems(workspaceId, ctx);
        expect(metas).toHaveLength(2);
        // the snapshot viewer reads the stored original back, whole
        expect(await getItemBody(workspaceId, ctx, item.id)).toBe(body.trim());
        await expect(getItemBody(workspaceId, ctx, artifactId)).rejects.toThrow(/no such item/);
        // the reported chunk counts match what was actually stored
        expect(metas.find((m) => m.id === item.id)!.chunks).toBe(rows.length);
        expect(metas.find((m) => m.id === art.id)!.chunks).toBe(1);
        expect(item.chunks).toBe(rows.length); // the insert-time meta already carries it
    });

    it("ingests a starter template from the catalog, resyncable", async () => {
        const { userId, workspaceId } = await seedUser();
        const { id: ctx } = await createContext(workspaceId, userId, "Starters");

        const item = await addTemplateItem(workspaceId, ctx, userId, "sales-deck", fakeEmbed);
        expect(item.kind).toBe("template");
        expect(item.ref).toBe("sales-deck");
        expect(item.chunks).toBeGreaterThan(0);
        expect((await chunkRows(item.id)).length).toBe(item.chunks);

        await resyncItem(workspaceId, ctx, item.id, fakeEmbed); // template re-reads the catalog
        expect((await chunkRows(item.id)).length).toBe(item.chunks);

        await expect(
            addTemplateItem(workspaceId, ctx, userId, "no-such-template", fakeEmbed),
        ).rejects.toThrow(/no such template/);
    });

    it("updates name and description, workspace-scoped", async () => {
        const { userId, workspaceId } = await seedUser();
        const other = await seedUser();
        const { id: ctx } = await createContext(workspaceId, userId, "Draft name");

        await updateContext(workspaceId, ctx, { name: "Brand Voice", description: "How we sound" });
        const [summary] = await listContexts(workspaceId);
        expect(summary).toMatchObject({ name: "Brand Voice", description: "How we sound" });

        await updateContext(workspaceId, ctx, { description: null });
        expect((await listContexts(workspaceId))[0]!.description).toBeNull();

        await expect(updateContext(other.workspaceId, ctx, { name: "stolen" })).rejects.toThrow(
            /no such context/,
        );
    });

    it("retrieves the matching chunks first and only from the given contexts", async () => {
        const { userId, workspaceId } = await seedUser();
        const { id: a } = await createContext(workspaceId, userId, "A");
        const { id: b } = await createContext(workspaceId, userId, "B");
        await addTextItem(workspaceId, a, userId, "text", "Notes", "the heron facts", fakeEmbed);
        await addTextItem(workspaceId, a, userId, "text", "Other", "the anvil facts", fakeEmbed);
        await addTextItem(
            workspaceId,
            b,
            userId,
            "text",
            "Elsewhere",
            "more heron facts",
            fakeEmbed,
        );

        const hits = await retrieveContext(workspaceId, [a], "tell me about the heron", fakeEmbed);
        expect(hits[0]!.text).toBe("the heron facts");
        expect(hits.map((h) => h.text)).not.toContain("more heron facts"); // context B not attached

        const pack = await makeContextRetriever(workspaceId, [a], fakeEmbed)!.pack("heron");
        expect(pack).toContain("From Notes (pasted material):");
        expect(pack).toContain("> the heron facts");
    });

    it("scopes everything to the workspace", async () => {
        const alice = await seedUser();
        const bob = await seedUser();
        const { id: ctx } = await createContext(alice.workspaceId, alice.userId, "Private");
        await addTextItem(
            alice.workspaceId,
            ctx,
            alice.userId,
            "text",
            "Secret",
            "meridian numbers",
            fakeEmbed,
        );

        expect(await listContexts(bob.workspaceId)).toHaveLength(0);
        await expect(getContextItems(bob.workspaceId, ctx)).rejects.toThrow(/no such context/);
        // even with the raw id, retrieval is workspace-keyed
        expect(await retrieveContext(bob.workspaceId, [ctx], "meridian", fakeEmbed)).toHaveLength(
            0,
        );
        // an artifact from another workspace can't be pulled into a context
        const foreign = await seedArtifact(bob.workspaceId, "Bob's", "text");
        await expect(
            addArtifactItem(alice.workspaceId, ctx, alice.userId, foreign, fakeEmbed),
        ).rejects.toThrow(/no such artifact/);
    });

    it("removing an item and deleting a context both drop their chunks", async () => {
        const { userId, workspaceId } = await seedUser();
        const { id: ctx } = await createContext(workspaceId, userId, "Doomed");
        const kept = await addTextItem(
            workspaceId,
            ctx,
            userId,
            "text",
            "K",
            "anvil one",
            fakeEmbed,
        );
        const gone = await addTextItem(
            workspaceId,
            ctx,
            userId,
            "text",
            "G",
            "anvil two",
            fakeEmbed,
        );

        await removeItem(workspaceId, ctx, gone.id);
        expect(await chunkRows(gone.id)).toHaveLength(0);
        expect(await chunkRows(kept.id)).toHaveLength(1);

        await deleteContext(workspaceId, ctx);
        expect(await chunkRows(kept.id)).toHaveLength(0);
        expect(await listContexts(workspaceId)).toHaveLength(0);
        expect(
            await db
                .select()
                .from(schema.contextItems)
                .where(eq(schema.contextItems.contextId, ctx)),
        ).toHaveLength(0);
    });
});

describe("conversation memory", () => {
    it("recalls only exchanges older than the verbatim window, keyed by artifact", async () => {
        const { workspaceId } = await seedUser();
        // the distinctive exchange lands first, then 16 filler messages push it out of the window
        await recordChatExchange(
            workspaceId,
            null,
            [{ role: "user", text: "our mascot is a heron, remember that" }],
            fakeEmbed,
        );
        for (let i = 0; i < 8; i++) {
            await recordChatExchange(
                workspaceId,
                null,
                [
                    { role: "user", text: `filler question ${i}` },
                    { role: "assistant", text: `filler answer ${i}` },
                ],
                fakeEmbed,
            );
        }

        const recalled = await recallConversation(workspaceId, null, "the heron", fakeEmbed);
        expect(recalled).toContain("They said: our mascot is a heron");

        // a message still inside the newest-16 window is never recalled (the client replays it
        // verbatim); recall is top-k with no distance floor, so other lines may still come back
        await recordChatExchange(
            workspaceId,
            null,
            [{ role: "user", text: "the anvil weighs 40kg" }],
            fakeEmbed,
        );
        const anvil = await recallConversation(workspaceId, null, "the anvil", fakeEmbed);
        expect(anvil ?? "").not.toContain("anvil weighs 40kg");

        // a different conversation key sees none of it
        const otherKey = "00000000-0000-4000-8000-000000000000";
        expect(await recallConversation(workspaceId, otherKey, "the heron", fakeEmbed)).toBeNull();
    });

    it("stores chat chunks under the chat scope", async () => {
        const { workspaceId } = await seedUser();
        await recordChatExchange(
            workspaceId,
            null,
            [{ role: "assistant", text: "noted" }],
            fakeEmbed,
        );
        const rows = await db
            .select()
            .from(schema.chunks)
            .where(
                and(eq(schema.chunks.workspaceId, workspaceId), eq(schema.chunks.scope, "chat")),
            );
        expect(rows).toHaveLength(1);
    });
});
