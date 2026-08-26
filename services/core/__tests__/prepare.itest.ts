import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent, Section } from "@model/artifact";
import { asContent } from "@model/artifact";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { adopt, shelve } from "@services/core/voices";
import { prepare } from "@services/core/prepare";

// Its own file for the reason ai-notes-billing.itest.ts is: it turns the scripted model ON, and
// ai.itest.ts asserts what an UNCONFIGURED server does.
let savedFake: string | undefined;
let savedKey: string | undefined;
let realFetch: typeof fetch;

beforeEach(() => {
    savedFake = process.env.GALLEO_FAKE_AI;
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.GALLEO_FAKE_AI = "1";
    process.env.ELEVENLABS_API_KEY = "test-key";
    realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/text-to-speech/"))
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        audio_base64: Buffer.from("mp3").toString("base64"),
                        alignment: {
                            characters: ["a"],
                            character_start_times_seconds: [0],
                            character_end_times_seconds: [1],
                        },
                    }),
                ),
            );
        if (u.includes("/v1/music")) return Promise.resolve(new Response(Buffer.from("bed")));
        if (u.includes("/shared-voices")) return Promise.resolve(new Response('{"voices":[]}'));
        if (u.includes("/voices/add"))
            return Promise.resolve(new Response(JSON.stringify({ voice_id: `acct-${n}` })));
        return realFetch(url, init);
    }) as typeof fetch;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedFake === undefined) delete process.env.GALLEO_FAKE_AI;
    else process.env.GALLEO_FAKE_AI = savedFake;
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

let n = 0;
const section = (id: string, text: string, spoken?: string): Section => ({
    id,
    root: { type: "text", data: { text } },
    ...(spoken ? { notes: { spoken } } : {}),
});

const content = (...sections: Section[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections,
});

/** A workspace on a plan that carries the features, with a voice on its shelf. */
async function seedReady(prepareAudio = true): Promise<{ workspaceId: string; userId: string }> {
    const { workspaceId, userId } = await seedUser({ plan: "pro" });
    n += 1;
    const v = await adopt(
        { externalId: `prep-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
        globalThis.fetch,
    );
    await shelve(workspaceId, v.id);
    await db
        .update(schema.workspaces)
        .set({ prepareAudio })
        .where(eq(schema.workspaces.id, workspaceId));
    return { workspaceId, userId };
}

async function seedArtifact(
    workspaceId: string,
    userId: string | null,
    c: ArtifactContent,
): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            formatId: "deck",
            themeId: "studio",
            ...(userId ? { createdBy: userId } : {}),
            draftContent: c as typeof schema.artifacts.$inferInsert.draftContent,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

const scriptsOf = async (id: string): Promise<(string | undefined)[]> => {
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
    return asContent(a!.draftContent).sections.map((s) => s.notes?.spoken);
};

const recordings = async (id: string): Promise<number> => {
    const rows = await db
        .select({ id: schema.narrations.id })
        .from(schema.narrations)
        .where(eq(schema.narrations.artifactId, id));
    return rows.length;
};

const beds = async (id: string): Promise<number> => {
    const rows = await db
        .select({ id: schema.soundtracks.id })
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.artifactId, id));
    return rows.length;
};

describe("preparing a piece before anyone asks", () => {
    it("writes the scripts, records them, and composes a bed", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content(section("s1", "A headline"), section("s2", "A second headline")),
        );

        await prepare({ artifactId, workspaceId });

        expect((await scriptsOf(artifactId)).every(Boolean)).toBe(true);
        expect(await recordings(artifactId)).toBe(2);
        expect(await beds(artifactId)).toBe(1);
    });

    // the whole point of it being cheap to trigger from anywhere
    it("finds nothing to do the second time, and spends nothing", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(workspaceId, userId, content(section("s1", "A")));
        await prepare({ artifactId, workspaceId });

        let calls = 0;
        const counted = globalThis.fetch;
        globalThis.fetch = ((u: string, i?: RequestInit) => {
            if (String(u).includes("elevenlabs")) calls += 1;
            return counted(u, i);
        }) as typeof fetch;

        await prepare({ artifactId, workspaceId });
        expect(calls).toBe(0);
        expect(await recordings(artifactId)).toBe(1);
        expect(await beds(artifactId)).toBe(1);
    });

    /**
     * A script IS the words, so a section whose copy changed has a script that is now wrong. This is
     * the half that follows the content, where the bed deliberately does not.
     */
    it("rewrites a script whose copy has moved out from under it", async () => {
        const { workspaceId, userId } = await seedReady();
        const stale = "what the presenter used to say";
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content(section("s1", "The copy it was written for", stale)),
        );
        // stamped as AI-written against the copy it had then, which is what makes it go stale
        await db
            .update(schema.artifacts)
            .set({
                draftContent: content({
                    id: "s1",
                    root: { type: "text", data: { text: "Completely different copy now" } },
                    notes: { spoken: stale, source: "ai", of: "0" },
                }) as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, artifactId));

        await prepare({ artifactId, workspaceId });
        expect((await scriptsOf(artifactId))[0]).not.toBe(stale);
    });

    // rewriting what a person wrote is not a cache decision, whatever happened around it
    it("never touches a script a person wrote", async () => {
        const { workspaceId, userId } = await seedReady();
        const mine = "I say it this way";
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content({
                id: "s1",
                root: { type: "text", data: { text: "Copy that has since changed" } },
                notes: { spoken: mine, source: "human", of: "0" },
            }),
        );

        await prepare({ artifactId, workspaceId });
        expect((await scriptsOf(artifactId))[0]).toBe(mine);
    });

    // one call for however many moved, so a rewritten section still fits the argument around it
    it("rewrites everything that moved in a single pass", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content(
                {
                    id: "s1",
                    root: { type: "text", data: { text: "New one" } },
                    notes: { spoken: "old one", source: "ai", of: "0" },
                },
                {
                    id: "s2",
                    root: { type: "text", data: { text: "New two" } },
                    notes: { spoken: "old two", source: "ai", of: "0" },
                },
                section("s3", "Never scripted at all"),
            ),
        );

        await prepare({ artifactId, workspaceId });
        const scripts = await scriptsOf(artifactId);
        expect(scripts[0]).not.toBe("old one");
        expect(scripts[1]).not.toBe("old two");
        expect(scripts[2]).toBeTruthy();
    });

    /**
     * A new beat changes the story, not just a sentence, so the scripts around it are rewritten
     * with it. Otherwise the section before the insert still hands over to what used to follow.
     */
    it("refreshes the whole arc when the piece gains a section", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content(section("s1", "Opening"), section("s2", "Closing")),
        );
        await prepare({ artifactId, workspaceId });
        const before = await scriptsOf(artifactId);
        expect(before.every(Boolean)).toBe(true);

        const [a] = await db
            .select()
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, artifactId));
        const kept = asContent(a!.draftContent).sections;
        await db
            .update(schema.artifacts)
            .set({
                draftContent: content(
                    kept[0]!,
                    section("s-new", "A beat that was not here before"),
                    kept[1]!,
                ) as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, artifactId));

        await prepare({ artifactId, workspaceId });
        const after = await scriptsOf(artifactId);
        expect(after).toHaveLength(3);
        expect(after.every(Boolean)).toBe(true);
        // the scripted model reports how many it was asked for: all three, in one pass, so the
        // neighbours were rewritten alongside the newcomer rather than left handing over to nothing
        expect(before[0]).toContain("of 2");
        for (const script of after) expect(script).toContain("of 3");
    });

    // a section that is gone should not leave its voice behind
    it("drops the audio of a section that no longer exists", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(
            workspaceId,
            userId,
            content(section("s1", "A"), section("s2", "B")),
        );
        await prepare({ artifactId, workspaceId });
        expect(await recordings(artifactId)).toBe(2);

        const [a] = await db
            .select()
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, artifactId));
        const kept = asContent(a!.draftContent).sections[0]!;
        await db
            .update(schema.artifacts)
            .set({
                draftContent: content(kept) as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, artifactId));

        await prepare({ artifactId, workspaceId });
        expect(await recordings(artifactId)).toBe(1);
    });

    it("does nothing at all for a workspace that has not asked for it", async () => {
        const { workspaceId, userId } = await seedReady(false);
        const artifactId = await seedArtifact(workspaceId, userId, content(section("s1", "A")));

        await prepare({ artifactId, workspaceId });
        expect((await scriptsOf(artifactId))[0]).toBeUndefined();
        expect(await recordings(artifactId)).toBe(0);
        expect(await beds(artifactId)).toBe(0);
    });

    it("does nothing on a plan that does not carry the features", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        const { userId } = await seedUser({});
        await db
            .update(schema.workspaces)
            .set({ prepareAudio: true })
            .where(eq(schema.workspaces.id, workspaceId));
        const artifactId = await seedArtifact(workspaceId, userId, content(section("s1", "A")));

        await prepare({ artifactId, workspaceId });
        expect(await recordings(artifactId)).toBe(0);
        expect(await beds(artifactId)).toBe(0);
    });

    // every spend needs someone to bill, and a row with no author has nobody
    it("skips an artifact with no author rather than guessing one", async () => {
        const { workspaceId } = await seedReady();
        const artifactId = await seedArtifact(workspaceId, null, content(section("s1", "A")));

        await prepare({ artifactId, workspaceId });
        expect(await recordings(artifactId)).toBe(0);
    });

    it("has nothing to say about an empty piece", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(workspaceId, userId, content());
        await expect(prepare({ artifactId, workspaceId })).resolves.toBeUndefined();
    });

    // it leaves the bed unattached on purpose: turning music on is the artifact's choice
    it("composes a bed without switching music on", async () => {
        const { workspaceId, userId } = await seedReady();
        const artifactId = await seedArtifact(workspaceId, userId, content(section("s1", "A")));

        await prepare({ artifactId, workspaceId });
        const [a] = await db
            .select()
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, artifactId));
        expect(asContent(a!.draftContent).music).toBeUndefined();
        expect(await beds(artifactId)).toBe(1);
    });
});
