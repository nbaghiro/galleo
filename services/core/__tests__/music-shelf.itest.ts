import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MUSIC_PRESETS } from "@services/core/ai/music";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    composeForWorkspace,
    defaultBed,
    ensurePreset,
    makeDefault,
    renameShelved,
    shelfFor,
    seedMusicShelf,
    shelve,
    unshelve,
} from "@services/core/soundtrack";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

const composer = (): { fetch: typeof fetch; calls: () => number } => {
    let calls = 0;
    const fn = (() => {
        calls += 1;
        return Promise.resolve(new Response(Buffer.from("fake-mp3")));
    }) as typeof fetch;
    return { fetch: fn, calls: () => calls };
};

const url = (id: string): string => `/bed/${id}`;
const names = async (ws: string): Promise<string[]> => (await shelfFor(ws, url)).map((b) => b.name);

describe("a workspace's music shelf", () => {
    it("names a shelved preset by its label, not by the prompt it was built from", async () => {
        const { workspaceId } = await seedUser({});
        const preset = await ensurePreset("calm", composer().fetch);
        await shelve(workspaceId, preset.row.id);
        expect(await names(workspaceId)).toEqual(["Calm"]);
    });

    // the same rule the voice shelf has: a shelf is never left with beds but no default
    it("makes the first bed the default without being asked", async () => {
        const { workspaceId } = await seedUser({});
        const preset = await ensurePreset("warm", composer().fetch);
        await shelve(workspaceId, preset.row.id);
        const [bed] = await shelfFor(workspaceId, url);
        expect(bed?.isDefault).toBe(true);
        expect((await defaultBed(workspaceId))?.id).toBe(preset.row.id);
    });

    it("moves the default rather than ending up with two", async () => {
        const { workspaceId } = await seedUser({});
        const a = await ensurePreset("calm", composer().fetch);
        const b = await ensurePreset("focused", composer().fetch);
        await shelve(workspaceId, a.row.id);
        await shelve(workspaceId, b.row.id);
        await makeDefault(workspaceId, b.row.id);

        const shelf = await shelfFor(workspaceId, url);
        expect(shelf.filter((x) => x.isDefault)).toHaveLength(1);
        expect((await defaultBed(workspaceId))?.id).toBe(b.row.id);
        expect(shelf[0]?.isDefault).toBe(true); // the default sorts first
    });

    it("promotes another when the default is taken off", async () => {
        const { workspaceId } = await seedUser({});
        const a = await ensurePreset("calm", composer().fetch);
        const b = await ensurePreset("uplifting", composer().fetch);
        await shelve(workspaceId, a.row.id);
        await shelve(workspaceId, b.row.id);

        await unshelve(workspaceId, (await defaultBed(workspaceId))!.id);
        expect(await shelfFor(workspaceId, url)).toHaveLength(1);
        expect((await defaultBed(workspaceId))?.id).toBe(b.row.id);
    });

    /**
     * Unlike a voice. A workspace with no bed simply plays no music, where a workspace with no voice
     * cannot narrate at all, which is why that shelf refuses to empty and this one does not.
     */
    it("lets a workspace keep no beds at all", async () => {
        const { workspaceId } = await seedUser({});
        const preset = await ensurePreset("cinematic", composer().fetch);
        await shelve(workspaceId, preset.row.id);
        await unshelve(workspaceId, preset.row.id);
        expect(await shelfFor(workspaceId, url)).toEqual([]);
        expect(await defaultBed(workspaceId)).toBeUndefined();
    });

    it("keeps a rename over the label", async () => {
        const { workspaceId } = await seedUser({});
        const preset = await ensurePreset("calm", composer().fetch);
        await shelve(workspaceId, preset.row.id);
        await renameShelved(workspaceId, preset.row.id, "Our opener");
        expect(await names(workspaceId)).toEqual(["Our opener"]);
    });

    // a preset is one row for the whole deployment: two shelves point at it, nobody composes twice
    it("shares one preset row across workspaces", async () => {
        const a = await seedUser({});
        const b = await seedUser({});
        const c = composer();
        const first = await ensurePreset("focused", c.fetch);
        await shelve(a.workspaceId, first.row.id);
        const second = await ensurePreset("focused", c.fetch);
        await shelve(b.workspaceId, second.row.id);

        expect(second.row.id).toBe(first.row.id);
        expect(c.calls()).toBe(1);
        expect(await names(a.workspaceId)).toEqual(["Focused"]);
        expect(await names(b.workspaceId)).toEqual(["Focused"]);
    });

    // taking a preset off one shelf must not take it off everyone else's
    it("keeps a preset for other workspaces when one drops it", async () => {
        const a = await seedUser({});
        const b = await seedUser({});
        const preset = await ensurePreset("warm", composer().fetch);
        await shelve(a.workspaceId, preset.row.id);
        await shelve(b.workspaceId, preset.row.id);

        await unshelve(a.workspaceId, preset.row.id);
        expect(await names(b.workspaceId)).toEqual(["Warm"]);
        const [row] = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.id, preset.row.id));
        expect(row).toBeDefined();
    });
});

describe("seeding the shelf", () => {
    it("composes each house bed once and puts it on every shelf that can play it", async () => {
        const a = await seedUser({ plan: "pro" });
        const b = await seedUser({ plan: "pro" });
        const c = composer();

        const composed = await seedMusicShelf(
            [
                { id: a.workspaceId, music: true },
                { id: b.workspaceId, music: true },
            ],
            c.fetch,
        );
        expect(composed).toBe(MUSIC_PRESETS.length);
        expect(c.calls()).toBe(MUSIC_PRESETS.length); // one per preset, not per workspace
        expect(await shelfFor(a.workspaceId, url)).toHaveLength(MUSIC_PRESETS.length);
        expect(await shelfFor(b.workspaceId, url)).toHaveLength(MUSIC_PRESETS.length);
    });

    it("leaves every shelf with exactly one default", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await seedMusicShelf([{ id: workspaceId, music: true }], composer().fetch);
        const shelf = await shelfFor(workspaceId, url);
        expect(shelf.filter((x) => x.isDefault)).toHaveLength(1);
        expect(await defaultBed(workspaceId)).toBeDefined();
    });

    // a reseed re-shelves what is already there rather than paying to compose it again
    it("composes nothing the second time", async () => {
        const a = await seedUser({ plan: "pro" });
        await seedMusicShelf([{ id: a.workspaceId, music: true }], composer().fetch);
        const c = composer();
        const again = await seedMusicShelf([{ id: a.workspaceId, music: true }], c.fetch);
        expect(again).toBe(0);
        expect(c.calls()).toBe(0);
    });

    it("skips a shelf whose plan cannot play music", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        expect(await seedMusicShelf([{ id: workspaceId, music: false }], composer().fetch)).toBe(0);
        expect(await shelfFor(workspaceId, url)).toEqual([]);
    });

    // an environment with no key opens with an empty shelf rather than failing the seed
    it("does nothing at all without a key", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const { workspaceId } = await seedUser({ plan: "pro" });
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        expect(await seedMusicShelf([{ id: workspaceId, music: true }], never)).toBe(0);
    });
});

describe("composing a bed from a description", () => {
    it("shelves what it composed, named by what was asked for", async () => {
        const { workspaceId } = await seedUser({});
        const out = await composeForWorkspace(
            workspaceId,
            "slow dub with a warm bassline",
            composer().fetch,
        );
        expect(out.row.source).toBe("workspace");
        expect(out.row.workspaceId).toBe(workspaceId);
        expect(out.row.prompt).toContain("slow dub with a warm bassline");
        expect(out.row.prompt).toContain("no vocals"); // the bed rules still apply
        expect(await names(workspaceId)).toEqual(["slow dub with a warm bassline"]);
    });

    it("asking twice for the same thing composes once", async () => {
        const { workspaceId } = await seedUser({});
        const c = composer();
        const first = await composeForWorkspace(workspaceId, "rainy piano", c.fetch);
        const again = await composeForWorkspace(workspaceId, "rainy piano", c.fetch);
        expect(c.calls()).toBe(1);
        expect(again.row.id).toBe(first.row.id);
        expect(again.ms).toBe(0);
        expect(await shelfFor(workspaceId, url)).toHaveLength(1);
    });

    it("refuses an empty description rather than paying for whatever that produces", async () => {
        const { workspaceId } = await seedUser({});
        await expect(composeForWorkspace(workspaceId, "   ")).rejects.toMatchObject({
            status: 502,
        });
    });

    // one workspace's commissioned bed is not another's to find
    it("belongs to the workspace that asked for it", async () => {
        const a = await seedUser({});
        const b = await seedUser({});
        await composeForWorkspace(a.workspaceId, "brushed drums", composer().fetch);
        expect(await shelfFor(b.workspaceId, url)).toEqual([]);
    });

    // a commissioned bed exists only for its shelf, so removing it is deleting it
    it("is deleted when it comes off the shelf", async () => {
        const { workspaceId } = await seedUser({});
        const out = await composeForWorkspace(workspaceId, "muted trumpet", composer().fetch);
        await unshelve(workspaceId, out.row.id);
        const [row] = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.id, out.row.id));
        expect(row).toBeUndefined();
    });
});
