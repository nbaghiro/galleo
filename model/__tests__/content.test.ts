import { describe, expect, it } from "vitest";
import type { ArtifactContent, Section } from "@model/artifact";
import { applySectionOps, diffSections } from "@model/content";

const sec = (id: string, text = id): Section => ({
    id,
    root: { type: "text", data: { style: "body", text } },
});

const doc = (...ids: string[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: ids.map((id) => sec(id)),
});

const idsOf = (c: ArtifactContent): string[] => c.sections.map((s) => s.id);

describe("applySectionOps", () => {
    it("replaces a section in place", () => {
        const r = applySectionOps(doc("a", "b"), [{ kind: "set", section: sec("b", "new") }]);
        expect(r.ok && idsOf(r.content)).toEqual(["a", "b"]);
        expect(r.ok && (r.content.sections[1]!.root.data as { text: string }).text).toBe("new");
    });

    it("inserts at an index, clamping out-of-range ones", () => {
        const r = applySectionOps(doc("a", "b"), [
            { kind: "insert", section: sec("x"), index: 1 },
            { kind: "insert", section: sec("z"), index: 99 },
        ]);
        expect(r.ok && idsOf(r.content)).toEqual(["a", "x", "b", "z"]);
    });

    it("removes and reorders", () => {
        const r = applySectionOps(doc("a", "b", "c"), [
            { kind: "remove", id: "b" },
            { kind: "order", ids: ["c", "a"] },
        ]);
        expect(r.ok && idsOf(r.content)).toEqual(["c", "a"]);
    });

    it("merges shell fields without touching sections", () => {
        const r = applySectionOps(doc("a"), [
            { kind: "shell", shell: { format: "doc", theme: "aurora" } },
        ]);
        expect(r.ok && r.content.format).toBe("doc");
        expect(r.ok && r.content.theme).toBe("aurora");
        expect(r.ok && idsOf(r.content)).toEqual(["a"]);
    });

    it("rejects the batch when a section is unknown, duplicated, or the order is partial", () => {
        expect(applySectionOps(doc("a"), [{ kind: "set", section: sec("ghost") }]).ok).toBe(false);
        expect(applySectionOps(doc("a"), [{ kind: "remove", id: "ghost" }]).ok).toBe(false);
        expect(
            applySectionOps(doc("a"), [{ kind: "insert", section: sec("a"), index: 0 }]).ok,
        ).toBe(false);
        expect(applySectionOps(doc("a", "b"), [{ kind: "order", ids: ["a"] }]).ok).toBe(false);
    });

    it("leaves the input untouched", () => {
        const before = doc("a", "b");
        applySectionOps(before, [{ kind: "remove", id: "a" }]);
        expect(idsOf(before)).toEqual(["a", "b"]);
    });
});

describe("diffSections", () => {
    it("is empty when nothing changed", () => {
        const d = doc("a", "b");
        expect(diffSections(d, { ...d, sections: [...d.sections] })).toEqual([]);
    });

    it("emits set only for the section whose identity changed", () => {
        const before = doc("a", "b");
        const after = { ...before, sections: [before.sections[0]!, sec("b", "edited")] };
        const ops = diffSections(before, after);
        expect(ops).toEqual([{ kind: "set", section: after.sections[1] }]);
    });

    it("emits insert with its landing index, and remove for what left", () => {
        const before = doc("a", "b");
        const inserted = sec("x");
        // keep the surviving sections' identities, the way an editor op does
        const after = { ...before, sections: [before.sections[0]!, inserted, before.sections[1]!] };
        expect(diffSections(before, after)).toEqual([
            { kind: "insert", section: inserted, index: 1 },
        ]);

        const dropped = { ...before, sections: [before.sections[0]!] };
        expect(diffSections(before, dropped)).toEqual([{ kind: "remove", id: "b" }]);
    });

    it("re-sends a section whose object identity changed, even if it looks the same", () => {
        const before = doc("a");
        const after = doc("a"); // same content, fresh objects
        expect(diffSections(before, after)).toEqual([{ kind: "set", section: after.sections[0] }]);
    });

    it("emits an order op only when surviving sections moved", () => {
        const before = doc("a", "b", "c");
        const moved = {
            ...before,
            sections: [before.sections[2]!, ...before.sections.slice(0, 2)],
        };
        const ops = diffSections(before, moved);
        expect(ops.at(-1)).toEqual({ kind: "order", ids: ["c", "a", "b"] });
        expect(ops.filter((o) => o.kind === "set")).toHaveLength(0); // identities are unchanged
    });

    it("emits a shell op when format, theme, or background changed", () => {
        const before = doc("a");
        expect(diffSections(before, { ...before, theme: "aurora" })).toMatchObject([
            { kind: "shell", shell: { theme: "aurora" } },
        ]);
    });

    it("round-trips through applySectionOps", () => {
        const before = doc("a", "b", "c");
        const after: ArtifactContent = {
            ...before,
            theme: "aurora",
            sections: [before.sections[2]!, sec("b", "edited"), sec("new")],
        };
        const applied = applySectionOps(before, diffSections(before, after));
        expect(applied.ok).toBe(true);
        expect(applied.ok && applied.content).toEqual(after);
    });
});
