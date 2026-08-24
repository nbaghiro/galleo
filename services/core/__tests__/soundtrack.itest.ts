import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { THEMES } from "@themes";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    audioFor,
    composeForArtifact,
    ensurePreset,
    presets,
    selfDescription,
    soundtrackFor,
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

/** Counts provider calls, which is what the shared-preset design is a claim about. */
function composer(): { fetch: typeof fetch; calls: () => number } {
    let calls = 0;
    const fn = (() => {
        calls += 1;
        return Promise.resolve(new Response(Buffer.from("fake-mp3")));
    }) as typeof fetch;
    return { fetch: fn, calls: () => calls };
}

const content = (music?: ArtifactContent["music"]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [{ id: "s1", root: { type: "text", data: { text: "A headline" } } }],
    ...(music ? { music } : {}),
});

async function seedArtifact(
    workspaceId: string,
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({ workspaceId, formatId: "deck", themeId: "studio", ...over })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

const url = (t: string): string => `/bed/${t}`;

describe("presets", () => {
    it("lists the house set and says which this deployment has built", async () => {
        const list = await presets();
        expect(list.length).toBeGreaterThan(3);
        expect(list.every((p) => p.name && p.description)).toBe(true);
    });

    // The whole reason presets exist: one generation for the entire install, not one per artifact.
    it("generates a preset once, however many times it is asked for", async () => {
        const c = composer();
        const first = await ensurePreset("focused", c.fetch);
        const second = await ensurePreset("focused", c.fetch);
        expect(second.row.id).toBe(first.row.id);
        expect(c.calls()).toBe(1);
        expect(second.chars).toBe(0); // a cached preset bills nothing
    });

    it("is shared across workspaces, which is what makes it nearly free", async () => {
        const a = await seedUser({});
        const b = await seedUser({});
        const c = composer();
        const one = await ensurePreset("uplifting", c.fetch);

        const artA = await seedArtifact(a.workspaceId);
        const artB = await seedArtifact(b.workspaceId);
        const bed = content({ on: true, trackId: one.row.id });
        expect((await soundtrackFor(bed, artA, url))?.id).toBe(one.row.id);
        expect((await soundtrackFor(bed, artB, url))?.id).toBe(one.row.id);
        expect(c.calls()).toBe(1);
    });

    it("refuses an id that is not in the house set", async () => {
        await expect(ensurePreset("nonsense", composer().fetch)).rejects.toThrow(/no such preset/);
    });
});

describe("a custom bed, written for one artifact", () => {
    it("belongs to it, and asking twice for the same piece costs nothing", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        const c = composer();
        const first = await composeForArtifact(artifactId, content(), 60_000, c.fetch);
        const again = await composeForArtifact(artifactId, content(), 60_000, c.fetch);
        expect(again.row.id).toBe(first.row.id);
        expect(again.ms).toBe(0);
        expect(c.calls()).toBe(1);
    });

    it("supersedes the previous one rather than stacking beds on an artifact", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        const c = composer();
        await composeForArtifact(artifactId, content(), 60_000, c.fetch);
        await composeForArtifact(artifactId, content(), 90_000, c.fetch);
        const rows = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.artifactId, artifactId));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.ms).toBe(90_000);
    });

    it("goes with the artifact when it is deleted", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        await composeForArtifact(artifactId, content(), 60_000, composer().fetch);
        await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifactId));
        const rows = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.artifactId, artifactId));
        expect(rows).toHaveLength(0);
    });
});

describe("soundtrackFor", () => {
    it("is null when the piece has music switched off, whatever it points at", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        const one = await ensurePreset("warm", composer().fetch);
        expect(
            await soundtrackFor(content({ on: false, trackId: one.row.id }), artifactId, url),
        ).toBeNull();
    });

    it("falls back to the default preset when nothing was chosen", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        await ensurePreset("calm", composer().fetch);
        const got = await soundtrackFor(content({ on: true }), artifactId, url);
        expect(got?.preset).toBe("calm");
    });

    // A read must never generate: an anonymous link viewer reaches this and cannot be billed.
    it("is null rather than composing when the default has never been built", async () => {
        await db.delete(schema.soundtracks).where(eq(schema.soundtracks.preset, "calm"));
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        expect(await soundtrackFor(content({ on: true }), artifactId, url)).toBeNull();
    });
});

describe("audioFor", () => {
    it("serves a preset to any artifact, since presets belong to the install", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        const one = await ensurePreset("cinematic", composer().fetch);
        expect((await audioFor(one.row.id, artifactId))?.mime).toBe("audio/mpeg");
    });

    it("refuses a custom bed through an artifact it does not belong to", async () => {
        const { workspaceId } = await seedUser({});
        const mine = await seedArtifact(workspaceId);
        const theirs = await seedArtifact(workspaceId);
        const bed = await composeForArtifact(mine, content(), 60_000, composer().fetch);
        expect(await audioFor(bed.row.id, mine)).not.toBeNull();
        expect(await audioFor(bed.row.id, theirs)).toBeNull();
    });

    it("is null for a track that does not exist", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId);
        expect(await audioFor("00000000-0000-0000-0000-000000000000", artifactId)).toBeNull();
    });
});

// artifacts.theme_id is a slug for a built-in and a uuid for a custom theme, and themes.id is a uuid
// column: reading one without a guard is a Postgres error, not a miss, which 502'd every custom bed
describe("selfDescription", () => {
    it("reads a built-in theme without asking the database about a slug", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, {
            themeId: "studio",
            title: "The Private Ledger",
        });
        const got = await selfDescription(artifactId);
        expect(got.title).toBe("The Private Ledger");
        expect(got.theme.tag).toBeTruthy();
        expect(got.theme.tag).not.toBe("studio"); // the descriptor, not the id
        expect(typeof got.theme.isDark).toBe("boolean");
    });

    it("carries a dark built-in's darkness into the prompt", async () => {
        const { workspaceId } = await seedUser({});
        const dark = Object.values(THEMES).find((t) => t.dark);
        expect(dark).toBeDefined();
        const artifactId = await seedArtifact(workspaceId, { themeId: dark!.id });
        expect((await selfDescription(artifactId)).theme.isDark).toBe(true);

        await composeForArtifact(artifactId, content(), 60_000, composer().fetch);
        const [row] = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.artifactId, artifactId));
        expect(row?.prompt).toContain("nocturnal");
    });

    it("prefers a custom theme's own mood, which a person wrote", async () => {
        const { workspaceId } = await seedUser({});
        const [t] = await db
            .insert(schema.themes)
            .values({
                workspaceId,
                name: "Ours",
                tokens: {},
                mood: "quiet and editorial",
                isDark: true,
            })
            .returning({ id: schema.themes.id });
        const artifactId = await seedArtifact(workspaceId, { themeId: t!.id });
        const got = await selfDescription(artifactId);
        expect(got.theme.mood).toBe("quiet and editorial");
        expect(got.theme.isDark).toBe(true);
    });

    it("falls back to the raw id for a theme nothing knows about", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, { themeId: "no-such-theme" });
        expect((await selfDescription(artifactId)).theme.tag).toBe("no-such-theme");
    });
});
