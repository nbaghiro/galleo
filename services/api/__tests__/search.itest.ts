import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { SearchResponse } from "@model/artifact";
import { artifactDigest, artifactSearchText } from "@model/digest";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";
import { parseSnippet, toTsQuery } from "../../search/query";

const content = (title: string, body: string[]): Record<string, unknown> => ({
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    children: [
                        { type: "text", data: { style: "h1", text: title } },
                        ...body.map((t) => ({ type: "text", data: { style: "body", text: t } })),
                    ],
                },
            },
        },
    ],
});

// writes the row the way the API does, so the generated tsvector is exercised for real
async function seedArtifact(
    workspaceId: string,
    title: string,
    body: string[] = [],
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const draft = content(title, body);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title,
            formatId: "deck",
            themeId: "studio",
            draftContent: draft,
            digest: artifactDigest(draft),
            searchText: artifactSearchText(draft),
            ...over,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

const hits = async (userId: string, qs: string): Promise<SearchResponse> => {
    const res = await authed(userId, `/search?${qs}`);
    expect(res.status).toBe(200);
    return (await res.json()) as SearchResponse;
};

describe("toTsQuery", () => {
    it("ANDs terms and prefixes the last one", () => {
        expect(toTsQuery("growth freemium")).toBe("growth & freemium:*");
    });

    it("strips every tsquery operator so raw input can't reach the parser", () => {
        expect(toTsQuery("a & b | !c :* ()")).toBe("a & b & c:*");
        expect(toTsQuery("';drop table artifacts;--")).toBe("drop & table & artifacts:*");
    });

    it("keeps non-latin words and returns null when nothing indexable is left", () => {
        expect(toTsQuery("café")).toBe("café:*");
        expect(toTsQuery("!!! ???")).toBeNull();
        expect(toTsQuery("   ")).toBeNull();
    });
});

describe("parseSnippet", () => {
    it("converts sentinel markers into offsets over the plain text", () => {
        const snip = parseSnippet("we sell freemium plans");
        expect(snip).toEqual({ text: "we sell freemium plans", marks: [[8, 16]] });
    });

    it("collapses whitespace (a fragment can straddle two sections) and keeps offsets true", () => {
        const snip = parseSnippet("  end of one.\n\n  start of two ");
        expect(snip!.text).toBe("end of one. start of two");
        expect(snip!.text.slice(...snip!.marks[0]!)).toBe("two");
    });

    it("drops empty results", () => {
        expect(parseSnippet("   ")).toBeNull();
        expect(parseSnippet(null)).toBeNull();
        expect(parseSnippet(undefined)).toBeNull();
    });
});

describe("GET /search", () => {
    it("401s without a session", async () => {
        const res = await request("/search?q=deck");
        expect(res.status).toBe(401);
    });

    it("matches on title and reports the match source", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Growth Playbook", ["nothing relevant here"]);
        const { artifacts } = await hits(userId, "q=growth");
        expect(artifacts.map((a) => a.title)).toEqual(["Growth Playbook"]);
        expect(artifacts[0]!.matchedIn).toBe("title");
        expect(artifacts[0]!.snippet).toBeNull();
    });

    it("matches body text and returns a highlighted snippet", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Untitled", [
            "The pricing ladder starts with a freemium tier for solo users",
        ]);
        const { artifacts } = await hits(userId, "q=freemium");
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]!.matchedIn).toBe("content");
        const snip = artifacts[0]!.snippet;
        expect(snip!.text).toContain("freemium");
        const [start, end] = snip!.marks[0]!;
        expect(snip!.text.slice(start, end).toLowerCase()).toBe("freemium");
    });

    it("finds mid-word title fragments the stemmer can't reach", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Macroeconomics 101");
        const { artifacts } = await hits(userId, "q=econom");
        expect(artifacts.map((a) => a.title)).toEqual(["Macroeconomics 101"]);
    });

    it("narrows as the query grows (prefix on the last term)", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Q3 review", ["revenue retention cohort analysis"]);
        await seedArtifact(workspaceId, "Q4 plan", ["revenue targets by region"]);
        expect((await hits(userId, "q=revenue")).artifacts).toHaveLength(2);
        expect((await hits(userId, "q=revenue+reten")).artifacts.map((a) => a.title)).toEqual([
            "Q3 review",
        ]);
    });

    it("ranks a title hit above a body-only hit", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Notes", ["a stray mention of onboarding in the body"]);
        await seedArtifact(workspaceId, "Onboarding guide", ["unrelated copy"]);
        const { artifacts } = await hits(userId, "q=onboarding");
        expect(artifacts.map((a) => a.title)).toEqual(["Onboarding guide", "Notes"]);
    });

    it("never leaks another workspace's artifacts", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        await seedArtifact(theirs.workspaceId, "Secret roadmap", ["confidential pricing"]);
        await seedArtifact(mine.workspaceId, "My roadmap", []);
        const { artifacts } = await hits(mine.userId, "q=roadmap");
        expect(artifacts.map((a) => a.title)).toEqual(["My roadmap"]);
        expect((await hits(mine.userId, "q=confidential")).artifacts).toEqual([]);
    });

    it("excludes trashed artifacts", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Deleted deck", [], { trashedAt: new Date() });
        expect((await hits(userId, "q=deleted")).artifacts).toEqual([]);
    });

    it("carries the cover, author, and format for the palette row", async () => {
        const { userId, workspaceId } = await seedUser();
        await db
            .update(schema.users)
            .set({ name: "Ada Lovelace" })
            .where(eq(schema.users.id, userId));
        await seedArtifact(workspaceId, "Field notes", ["observations"], { createdBy: userId });
        const [hit] = (await hits(userId, "q=field")).artifacts;
        expect(hit!.cover?.title).toBe("Field notes");
        expect(hit!.formatId).toBe("deck");
        expect(hit!.author?.name).toBe("Ada Lovelace");
        expect(hit!.lastViewedAt).toBeNull();
    });

    it("has no author when the creator is unknown", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Orphan deck");
        expect((await hits(userId, "q=orphan")).artifacts[0]!.author).toBeNull();
    });

    it("survives punctuation-only and stop-word queries", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "The report", ["body copy"]);
        expect((await hits(userId, "q=%3A*")).artifacts).toEqual([]);
        expect((await hits(userId, "q=the")).artifacts.map((a) => a.title)).toEqual(["The report"]);
    });

    it("treats a typed wildcard as a literal", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "Plain title");
        expect((await hits(userId, "q=%25")).artifacts).toEqual([]);
    });

    it("returns recents (most recently opened, then most recently edited) for an empty query", async () => {
        const { userId, workspaceId } = await seedUser();
        const old = await seedArtifact(workspaceId, "Older", [], {
            updatedAt: new Date(Date.now() - 86_400_000),
        });
        await seedArtifact(workspaceId, "Newer");
        expect((await hits(userId, "q=")).artifacts.map((a) => a.title)).toEqual([
            "Newer",
            "Older",
        ]);

        const visit = await authed(userId, `/artifacts/${old}/visit`, jsonInit("POST", {}));
        expect(visit.status).toBe(200);
        const { artifacts } = await hits(userId, "q=");
        expect(artifacts.map((a) => a.title)).toEqual(["Older", "Newer"]);
        expect(artifacts[0]!.lastViewedAt).not.toBeNull();
    });

    it("caps the result count", async () => {
        const { userId, workspaceId } = await seedUser();
        for (let i = 0; i < 5; i++) await seedArtifact(workspaceId, `Deck ${i}`);
        expect((await hits(userId, "q=deck&limit=2")).artifacts).toHaveLength(2);
        expect((await hits(userId, "q=deck&limit=999")).artifacts).toHaveLength(5);
        expect((await hits(userId, "q=deck&limit=nonsense")).artifacts).toHaveLength(5);
    });
});

describe("POST /artifacts/:id/visit", () => {
    it("counts repeat opens and refuses another workspace's artifact", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await seedArtifact(mine.workspaceId, "Mine");
        await authed(mine.userId, `/artifacts/${id}/visit`, jsonInit("POST", {}));
        await authed(mine.userId, `/artifacts/${id}/visit`, jsonInit("POST", {}));
        const rows = await db.select().from(schema.artifactVisits);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.views).toBe(2);

        const res = await authed(theirs.userId, `/artifacts/${id}/visit`, jsonInit("POST", {}));
        expect(res.status).toBe(404);
    });
});
