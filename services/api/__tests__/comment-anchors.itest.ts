import { beforeEach, describe, expect, it } from "vitest";
import type { ArtifactContent } from "@model/artifact";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";

// A comment anchors to an element id. The write path stamps one onto every element
// (contentWrite), so the ids a read serves are the row's own and an anchor written against
// them has to resolve on every later read.

let user: Awaited<ReturnType<typeof seedUser>>;
let artifactId: string;

const CONTENT: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "container",
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

    it("serves the same ids on every read", async () => {
        const served = idsIn((await readWindow()).sections);
        expect(served.length).toBeGreaterThan(0);
        expect(idsIn((await readWindow()).sections).sort()).toEqual([...served].sort());
    });

    for (const kind of ["element", "text"] as const) {
        it(`holds for a ${kind} anchor across a re-read`, async () => {
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
