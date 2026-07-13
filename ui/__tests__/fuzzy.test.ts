import { describe, expect, it } from "vitest";
import { fuzzyScore, rankItems } from "../fuzzy";

describe("fuzzyScore", () => {
    it("returns null when the query is not a subsequence", () => {
        expect(fuzzyScore("xyz", "delete element")).toBeNull();
        expect(fuzzyScore("dq", "duplicate")).toBeNull();
    });
    it("matches a subsequence", () => {
        expect(fuzzyScore("dup", "duplicate")).not.toBeNull();
        expect(fuzzyScore("gtl", "go to library")).not.toBeNull();
    });
    it("empty query scores neutral", () => {
        expect(fuzzyScore("", "anything")).toBe(0);
    });
    it("rewards start-of-word and consecutive matches", () => {
        const prefix = fuzzyScore("del", "delete")!;
        const scattered = fuzzyScore("del", "model editor")!;
        expect(prefix).toBeGreaterThan(scattered);
    });
    it("prefers a word-boundary match over a mid-word one", () => {
        const boundary = fuzzyScore("s", "go section")!;
        const mid = fuzzyScore("s", "insert")!;
        expect(boundary).toBeGreaterThan(mid);
    });
});

describe("rankItems", () => {
    const cmds = [
        { id: "edit.delete", title: "Delete element" },
        { id: "edit.duplicate", title: "Duplicate element" },
        { id: "nav.library", title: "Go to library" },
        { id: "present.start", title: "Present" },
    ];
    const hay = (c: { title: string }): string => c.title;

    it("returns the original order for an empty query", () => {
        expect(rankItems("", cmds, hay).map((c) => c.id)).toEqual([
            "edit.delete",
            "edit.duplicate",
            "nav.library",
            "present.start",
        ]);
    });
    it("filters out non-matches", () => {
        const ids = rankItems("dup", cmds, hay).map((c) => c.id);
        expect(ids).toContain("edit.duplicate");
        expect(ids).not.toContain("present.start");
    });
    it("ranks the best match first", () => {
        expect(rankItems("del", cmds, hay)[0]!.id).toBe("edit.delete");
        expect(rankItems("libr", cmds, hay)[0]!.id).toBe("nav.library");
    });
});
