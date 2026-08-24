import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { LibraryVoice } from "@model/speech";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    adopt,
    ensureVoice,
    makeDefault,
    shelfFor,
    shelve,
    unshelve,
    voiceFor,
    VoiceError,
} from "@services/core/voices";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

let n = 0;
const libVoice = (over: Partial<LibraryVoice> = {}): LibraryVoice => {
    n += 1;
    return {
        externalId: `ext-${n}-${Date.now()}`,
        ownerId: `owner-${n}`,
        name: `Voice ${n}`,
        ...over,
    };
};

/** Counts provider calls, which is the thing the adoption budget depends on. */
function countingFetch(): { fetch: typeof fetch; calls: () => number } {
    let calls = 0;
    const fn = ((url: string) => {
        calls += 1;
        const id = String(url).split("/").pop();
        return Promise.resolve(new Response(JSON.stringify({ voice_id: `acct-${id}` })));
    }) as typeof fetch;
    return { fetch: fn, calls: () => calls };
}

/** A library search followed by the add call it leads to, each with a distinct account id. */
function libraryThenAdd(): typeof fetch {
    let seq = 0;
    return ((url: string) => {
        if (String(url).includes("/shared-voices")) {
            seq += 1;
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        voices: [
                            {
                                voice_id: `auto-${seq}-${Date.now()}`,
                                public_owner_id: "o",
                                name: "Auto narrator",
                            },
                        ],
                    }),
                ),
            );
        }
        return Promise.resolve(
            new Response(JSON.stringify({ voice_id: `acct-${String(url).split("/").pop()}` })),
        );
    }) as typeof fetch;
}

describe("adopt", () => {
    it("adds a voice once and reuses the row afterwards", async () => {
        const v = libVoice();
        const { fetch: f, calls } = countingFetch();
        const first = await adopt(v, f);
        const second = await adopt(v, f);
        expect(second.id).toBe(first.id);
        // the second adoption must not reach the provider: the add budget is monthly and shared
        expect(calls()).toBe(1);
    });

    it("adopts once across two workspaces, which is the whole point of the shared cache", async () => {
        const a = await seedUser({});
        const b = await seedUser({});
        const v = libVoice();
        const { fetch: f, calls } = countingFetch();

        const rowA = await adopt(v, f);
        await shelve(a.workspaceId, rowA.id);
        const rowB = await adopt(v, f);
        await shelve(b.workspaceId, rowB.id);

        expect(calls()).toBe(1);
        const rows = await db
            .select()
            .from(schema.voices)
            .where(eq(schema.voices.externalId, rowA.externalId));
        expect(rows).toHaveLength(1);
        expect(await shelfFor(a.workspaceId)).toHaveLength(1);
        expect(await shelfFor(b.workspaceId)).toHaveLength(1);
    });

    it("stores the id the account speaks with, not the community one", async () => {
        const v = libVoice();
        const row = await adopt(v, countingFetch().fetch);
        expect(row.externalId).toBe(`acct-${v.externalId}`);
    });

    it("is a 502 when the provider refuses, and writes nothing", async () => {
        const v = libVoice();
        const failing = (() =>
            Promise.resolve(new Response("no", { status: 429 }))) as typeof fetch;
        await expect(adopt(v, failing)).rejects.toMatchObject({ status: 502 });
        const rows = await db
            .select()
            .from(schema.voices)
            .where(eq(schema.voices.externalId, v.externalId));
        expect(rows).toHaveLength(0);
    });

    it("is a 503 without a key, without touching the network", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(adopt(libVoice(), never)).rejects.toBeInstanceOf(VoiceError);
    });
});

describe("the shelf", () => {
    it("makes the first saved voice the default, since something has to be", async () => {
        const { workspaceId } = await seedUser({});
        const one = await adopt(libVoice(), countingFetch().fetch);
        await shelve(workspaceId, one.id);
        const shelf = await shelfFor(workspaceId);
        expect(shelf[0]?.isDefault).toBe(true);
    });

    it("keeps exactly one default, demoting the previous one", async () => {
        const { workspaceId } = await seedUser({});
        const f = countingFetch().fetch;
        const a = await adopt(libVoice(), f);
        const b = await adopt(libVoice(), f);
        await shelve(workspaceId, a.id);
        await shelve(workspaceId, b.id);
        await makeDefault(workspaceId, b.id);
        const shelf = await shelfFor(workspaceId);
        expect(shelf.filter((v) => v.isDefault)).toHaveLength(1);
        expect(shelf.find((v) => v.isDefault)?.id).toBe(b.id);
    });

    it("refuses to write a second default directly, so the rule is the database's", async () => {
        const { workspaceId } = await seedUser({});
        const f = countingFetch().fetch;
        const a = await adopt(libVoice(), f);
        const b = await adopt(libVoice(), f);
        await shelve(workspaceId, a.id);
        await shelve(workspaceId, b.id);
        await expect(
            db
                .update(schema.workspaceVoices)
                .set({ isDefault: true })
                .where(eq(schema.workspaceVoices.voiceId, b.id)),
        ).rejects.toThrow();
    });

    it("promotes another voice when the default is removed", async () => {
        const { workspaceId } = await seedUser({});
        const f = countingFetch().fetch;
        const a = await adopt(libVoice(), f);
        const b = await adopt(libVoice(), f);
        await shelve(workspaceId, a.id); // a is the default
        await shelve(workspaceId, b.id);
        await unshelve(workspaceId, a.id);
        const shelf = await shelfFor(workspaceId);
        expect(shelf).toHaveLength(1);
        expect(shelf[0]?.isDefault).toBe(true);
    });

    it("refuses to empty the shelf, since a workspace with none cannot narrate", async () => {
        const { workspaceId } = await seedUser({});
        const only = await adopt(libVoice(), countingFetch().fetch);
        await shelve(workspaceId, only.id);
        await expect(unshelve(workspaceId, only.id)).rejects.toMatchObject({ status: 402 });
    });
});

describe("voiceFor", () => {
    it("prefers the artifact's own voice over the workspace default", async () => {
        const { workspaceId } = await seedUser({});
        const f = countingFetch().fetch;
        const def = await adopt(libVoice(), f);
        const other = await adopt(libVoice(), f);
        await shelve(workspaceId, def.id);
        await shelve(workspaceId, other.id);
        expect((await voiceFor(workspaceId, other.id))?.id).toBe(other.id);
        expect((await voiceFor(workspaceId, undefined))?.id).toBe(def.id);
    });

    it("falls back to the default when the artifact names a voice off the shelf", async () => {
        const { workspaceId } = await seedUser({});
        const def = await adopt(libVoice(), countingFetch().fetch);
        await shelve(workspaceId, def.id);
        expect((await voiceFor(workspaceId, "00000000-0000-0000-0000-000000000000"))?.id).toBe(
            def.id,
        );
    });

    it("is null for a workspace with no voices, so narration is unavailable rather than guessed", async () => {
        const { workspaceId } = await seedUser({});
        expect(await voiceFor(workspaceId, undefined)).toBeNull();
    });

    it("reports the workspace's rename rather than the provider's name", async () => {
        const { workspaceId } = await seedUser({});
        const v = await adopt(libVoice({ name: "Provider Name" }), countingFetch().fetch);
        await shelve(workspaceId, v.id, { name: "Our narrator" });
        expect((await voiceFor(workspaceId, undefined))?.name).toBe("Our narrator");
    });
});

describe("ensureVoice", () => {
    it("adopts and shelves a default the first time a workspace narrates", async () => {
        const { workspaceId } = await seedUser({});
        expect(await voiceFor(workspaceId, undefined)).toBeNull();

        const chosen = await ensureVoice(workspaceId, undefined, libraryThenAdd());
        expect(chosen).not.toBeNull();
        const shelf = await shelfFor(workspaceId);
        expect(shelf).toHaveLength(1);
        expect(shelf[0]?.isDefault).toBe(true);
    });

    it("does not adopt again once the workspace has one", async () => {
        const { workspaceId } = await seedUser({});
        const f = libraryThenAdd();
        await ensureVoice(workspaceId, undefined, f);
        const before = await shelfFor(workspaceId);
        await ensureVoice(workspaceId, undefined, f);
        expect(await shelfFor(workspaceId)).toHaveLength(before.length);
    });

    // The premade voice is what makes narration work without a paid provider account, so an empty
    // or unreachable library falls through to it rather than leaving the workspace unable to speak.
    it("falls back to the premade voice when the library offers nothing", async () => {
        const { workspaceId } = await seedUser({});
        const empty = (() =>
            Promise.resolve(new Response(JSON.stringify({ voices: [] })))) as typeof fetch;
        const chosen = await ensureVoice(workspaceId, undefined, empty);
        expect(chosen?.name).toBe("Matilda");
        expect(await shelfFor(workspaceId)).toHaveLength(1);
    });

    it("falls back when the library refuses outright, which is what a free account does", async () => {
        const { workspaceId } = await seedUser({});
        const refused = (() =>
            Promise.resolve(new Response("no", { status: 401 }))) as typeof fetch;
        expect((await ensureVoice(workspaceId, undefined, refused))?.name).toBe("Matilda");
    });
});
