import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";

// A comment anchors to an element id. If the stored tree has none, every reader mints its own, and
// an anchor written against one tab's ids is unresolvable in the next read. So a read has to hand
// back ids that are actually in the row.

let user: Awaited<ReturnType<typeof seedUser>>;
let artifactId: string;

const CONTENT: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    direction: "col",
                    children: [
                        { type: "text", data: { text: "The second album", style: "h2" } },
                        { type: "text", data: { text: "Twelve tracks of midnight pop" } },
                    ],
                },
            },
        },
    ],
};

// what an artifact written before element ids existed looks like in the row
const stripIds = (id: string) =>
    db
        .update(schema.artifacts)
        .set({
            draftContent: sql`(regexp_replace(${schema.artifacts.draftContent}::text, '"id": ?"e-[0-9a-f]+", ?', '', 'g'))::jsonb`,
        })
        .where(eq(schema.artifacts.id, id));

const rowOf = async () => {
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, artifactId));
    return a!;
};

const idsIn = (v: unknown): string[] => JSON.stringify(v).match(/e-[0-9a-f]{8}/g) ?? [];

const readWindow = async (): Promise<ArtifactContent> => {
    const body = (await (
        await authed(user.userId, `/artifacts/${artifactId}?window=0:24`)
    ).json()) as { artifact: { shell: object; sections: unknown[] } };
    return { ...body.artifact.shell, sections: body.artifact.sections } as ArtifactContent;
};

beforeEach(async () => {
    user = await seedUser();
    const res = await authed(
        user.userId,
        "/artifacts",
        jsonInit("POST", { title: "Aria", draftContent: CONTENT }),
    );
    artifactId = ((await res.json()) as { id: string }).id;
});

describe("element ids a comment can anchor to", () => {
    it("stamps a row that has none, on the read, and keeps them from then on", async () => {
        await stripIds(artifactId);
        expect(idsIn((await rowOf()).draftContent)).toHaveLength(0);

        const first = await readWindow();
        const served = idsIn(first.sections);
        expect(served.length).toBeGreaterThan(0);
        // what was served is what the row now holds, so an anchor on it survives
        expect(idsIn((await rowOf()).draftContent).sort()).toEqual([...served].sort());

        // and a second read is stable rather than minting again
        expect(idsIn((await readWindow()).sections).sort()).toEqual([...served].sort());
    });

    it("does not count stamping as an edit", async () => {
        const before = await rowOf();
        await stripIds(artifactId);
        await readWindow();
        const after = await rowOf();
        // stamping is not something a person did: it must not reorder the library or make every
        // collaborator resync over a write nobody made
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect(after.seq).toBe(before.seq);
    });

    it("re-derives the digest and search text alongside the stamp", async () => {
        await stripIds(artifactId);
        await db
            .update(schema.artifacts)
            .set({ searchText: "" })
            .where(eq(schema.artifacts.id, artifactId));
        await readWindow();
        const after = await rowOf();
        expect(after.searchText).toContain("Twelve tracks");
        expect(after.digest?.sections?.[0]?.id).toBe("s1");
    });

    it("mints one set of ids for readers arriving together", async () => {
        await stripIds(artifactId);
        const [a, b] = await Promise.all([readWindow(), readWindow()]);
        expect(idsIn(a.sections).sort()).toEqual(idsIn(b.sections).sort());
        expect(idsIn((await rowOf()).draftContent).sort()).toEqual(idsIn(a.sections).sort());
    });

    it("leaves an already-stamped row alone", async () => {
        const before = await rowOf();
        await readWindow();
        expect((await rowOf()).draftContent).toEqual(before.draftContent);
    });
});

describe("a comment written against a served id resolves on the next read", () => {
    const comment = (elementId: string, kind: "element" | "text") =>
        authed(
            user.userId,
            `/artifacts/${artifactId}/comments`,
            jsonInit("POST", {
                body: kind === "text" ? "on this phrase" : "on this element",
                sectionId: "s1",
                anchor: { kind, elementId },
                quote: "Twelve tracks of midnight pop",
            }),
        );

    for (const kind of ["element", "text"] as const) {
        it(`holds for a ${kind} anchor across a re-read`, async () => {
            await stripIds(artifactId);
            const served = idsIn((await readWindow()).sections);
            const target = served[0]!;

            expect((await comment(target, kind)).status).toBe(200);

            const listed = (await (
                await authed(user.userId, `/artifacts/${artifactId}/comments`)
            ).json()) as { comments: { anchor: { elementId: string } }[] };
            const anchored = listed.comments[0]!.anchor.elementId;
            expect(anchored).toBe(target);

            // the read a reload makes still contains the id the anchor points at
            expect(idsIn((await readWindow()).sections)).toContain(anchored);
        });
    }

    it("survives a section-op write over the anchored section", async () => {
        await stripIds(artifactId);
        const content = await readWindow();
        const target = idsIn(content.sections)[0]!;
        await comment(target, "element");

        const section = content.sections[0]!;
        const patched = await authed(
            user.userId,
            `/artifacts/${artifactId}/content`,
            jsonInit("PATCH", { ops: [{ kind: "set", section }] }),
        );
        expect(patched.status).toBe(200);
        expect(idsIn((await readWindow()).sections)).toContain(target);
    });
});
