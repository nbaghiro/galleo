import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ArtifactContent, Section, SectionNotes } from "@model/artifact";
import { sectionFingerprint } from "@model/artifact";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// Its own file for the same reason ai-notes-billing.itest.ts is: it turns the scripted model ON, and
// ai.itest.ts asserts what an UNCONFIGURED server does.
describe("POST /ai/notes", () => {
    let savedFake: string | undefined;
    beforeAll(() => {
        savedFake = process.env.GALLEO_FAKE_AI;
        process.env.GALLEO_FAKE_AI = "1";
    });
    afterAll(() => {
        if (savedFake === undefined) delete process.env.GALLEO_FAKE_AI;
        else process.env.GALLEO_FAKE_AI = savedFake;
    });

    const section = (id: string, text: string): Section => ({
        id,
        root: { type: "text", data: { text } },
    });

    const content = (...sections: Section[]): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections,
    });

    async function seedArtifact(workspaceId: string, c: ArtifactContent): Promise<string> {
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId,
                draftContent: c as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .returning({ id: schema.artifacts.id });
        return a!.id;
    }

    /** The route streams SSE; the notes are the `notes` events in the body. */
    async function write(
        userId: string,
        body: Record<string, unknown>,
    ): Promise<{ sectionId: string; notes: SectionNotes }[]> {
        const res = await authed(userId, "/ai/notes", jsonInit("POST", body));
        expect(res.status).toBe(200);
        const out: { sectionId: string; notes: SectionNotes }[] = [];
        for (const line of (await res.text()).split("\n")) {
            if (!line.startsWith("data:")) continue;
            const ev = JSON.parse(line.slice(5)) as {
                type: string;
                sectionId?: string;
                notes?: SectionNotes;
                message?: string;
            };
            if (ev.type === "error") throw new Error(ev.message);
            if (ev.type === "notes" && ev.sectionId && ev.notes)
                out.push({ sectionId: ev.sectionId, notes: ev.notes });
        }
        return out;
    }

    it("writes a script for every section and stamps what it was written against", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const c = content(section("s1", "A headline"), section("s2", "A second headline"));
        const artifactId = await seedArtifact(workspaceId, c);

        const written = await write(userId, { artifactId, content: c });
        expect(written.map((w) => w.sectionId)).toEqual(["s1", "s2"]);
        for (const w of written) {
            expect(w.notes.spoken).toBeTruthy();
            expect(w.notes.source).toBe("ai");
            // the stamp is over the section the model was shown, which is what makes drift visible
            const at = c.sections.find((s) => s.id === w.sectionId)!;
            expect(w.notes.of).toBe(sectionFingerprint(at));
        }
    });

    // this is what the present bar's first press does: one section, with the piece for context
    it("writes one named section without touching the others", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const c = content(section("s1", "A headline"), section("s2", "A second headline"));
        const artifactId = await seedArtifact(workspaceId, c);

        const written = await write(userId, { artifactId, content: c, sectionIds: ["s2"] });
        expect(written.map((w) => w.sectionId)).toEqual(["s2"]);
        expect(written[0]?.notes.of).toBe(sectionFingerprint(c.sections[1]!));
    });

    // the stamp has to describe the section, not the piece, or every edit would invalidate everything
    it("stamps each section differently when their words differ", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const c = content(section("s1", "A headline"), section("s2", "Something else"));
        const artifactId = await seedArtifact(workspaceId, c);

        const written = await write(userId, { artifactId, content: c });
        expect(written[0]?.notes.of).not.toBe(written[1]?.notes.of);
    });

    it("refuses a piece with no sections rather than paying for nothing", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const c = content();
        const artifactId = await seedArtifact(workspaceId, c);
        const res = await authed(userId, "/ai/notes", jsonInit("POST", { artifactId, content: c }));
        expect(res.status).toBe(400);
    });
});
