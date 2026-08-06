import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section, Target } from "@model/artifact";
import {
    LAYOUT_PRESETS,
    applySectionOps,
    artifactDigest,
    artifactSearchText,
    childrenRaw,
    colGroup,
    diffSections,
    emptyRegion,
    parentTarget,
    parseTarget,
    regionId,
    removeAtPath,
    rowGroup,
    specificity,
    targetsEqual,
    updateAtPath,
    withWidth,
} from "@model/artifact";

const leaf = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const groupData = (i: ElementInstance): { direction?: string; align?: string; gap?: number } =>
    i.data as { direction?: string; align?: string; gap?: number };
const widthPct = (i: ElementInstance): number | undefined => {
    const w = i.layout?.width;
    return w && typeof w === "object" ? w.pct : undefined;
};

describe("LAYOUT_PRESETS", () => {
    it("maps preset ids to column fractions", () => {
        expect(LAYOUT_PRESETS.full).toEqual([1]);
        expect(LAYOUT_PRESETS["split-6040"]).toEqual([0.6, 0.4]);
        expect(LAYOUT_PRESETS["two-col"]).toEqual([0.5, 0.5]);
        expect(LAYOUT_PRESETS["three-up"]).toHaveLength(3);
    });
});

describe("withWidth", () => {
    it("sets an explicit column-width percent", () => {
        expect(widthPct(withWidth(leaf("a"), 60))).toBe(60);
    });
    it("preserves the rest of an existing layout", () => {
        expect(withWidth({ ...leaf("a"), layout: { align: "center" } }, 40).layout).toEqual({
            align: "center",
            width: { pct: 40 },
        });
    });
});

describe("rowGroup / colGroup / emptyRegion", () => {
    it("rowGroup with no widths keeps children as-is, centered with a gutter", () => {
        const g = rowGroup([leaf("a"), leaf("b")]);
        expect(groupData(g).direction).toBe("row");
        expect(groupData(g).align).toBe("center");
        expect(groupData(g).gap).toBeGreaterThan(0);
        expect(childrenRaw(g)?.map(textOf)).toEqual(["a", "b"]);
        expect(childrenRaw(g)?.map(widthPct)).toEqual([undefined, undefined]);
    });
    it("rowGroup with widths stamps each column's percent", () => {
        const g = rowGroup([leaf("a"), leaf("b")], [0.6, 0.4]);
        expect(childrenRaw(g)?.map(widthPct)).toEqual([60, 40]);
    });
    it("colGroup stacks vertically", () => {
        expect(groupData(colGroup([leaf("a")])).direction).toBe("col");
    });
    it("emptyRegion is a childless group", () => {
        expect(childrenRaw(emptyRegion())).toEqual([]);
    });
});

describe("childrenRaw", () => {
    it("returns a container's children, else undefined", () => {
        expect(childrenRaw(rowGroup([leaf("a")]))?.map(textOf)).toEqual(["a"]);
        expect(childrenRaw(leaf("a"))).toBeUndefined();
        expect(childrenRaw({ type: "x", data: { children: "not-an-array" } })).toBeUndefined();
    });
});

describe("updateAtPath", () => {
    it("an empty path targets the root", () => {
        expect(textOf(updateAtPath(leaf("a"), [], () => leaf("z")))).toBe("z");
    });
    it("replaces the node at a child path", () => {
        const root = rowGroup([leaf("a"), leaf("b")]);
        expect(childrenRaw(updateAtPath(root, [0], () => leaf("z")))?.map(textOf)).toEqual([
            "z",
            "b",
        ]);
    });
    it("is a no-op on a leaf (nothing to descend into)", () => {
        expect(textOf(updateAtPath(leaf("a"), [0], () => leaf("z")))).toBe("a");
    });
    it("leaves children untouched for an out-of-range index", () => {
        const root = rowGroup([leaf("a"), leaf("b")]);
        expect(childrenRaw(updateAtPath(root, [5], () => leaf("z")))?.map(textOf)).toEqual([
            "a",
            "b",
        ]);
    });
});

describe("removeAtPath", () => {
    it("removing the root yields an empty region", () => {
        expect(childrenRaw(removeAtPath(rowGroup([leaf("a")]), []))).toEqual([]);
    });
    it("removes the node at a child path", () => {
        const root = rowGroup([leaf("a"), leaf("b"), leaf("c")]);
        expect(childrenRaw(removeAtPath(root, [1]))?.map(textOf)).toEqual(["a", "c"]);
    });
});

const sectionT: Target = { kind: "section", section: "s" };
const elT: Target = { kind: "element", address: { section: "s", path: [0, 1] } };
const elEmpty: Target = { kind: "element", address: { section: "s", path: [] } };

describe("regionId ⇄ parseTarget round-trip", () => {
    it("round-trips a section target", () => {
        expect(parseTarget(regionId(sectionT))).toEqual(sectionT);
    });
    it("round-trips an element with a path", () => {
        expect(parseTarget(regionId(elT))).toEqual(elT);
    });
    it("round-trips an element with an empty path", () => {
        expect(parseTarget(regionId(elEmpty))).toEqual(elEmpty);
    });
});

describe("parseTarget", () => {
    it("parses a dotted element path", () => {
        expect(parseTarget("el:s:0.1")).toEqual({
            kind: "element",
            address: { section: "s", path: [0, 1] },
        });
    });
    it("parses a pathless element as the root", () => {
        expect(parseTarget("el:s")).toEqual({
            kind: "element",
            address: { section: "s", path: [] },
        });
    });
    it("returns null for junk / empty input", () => {
        expect(parseTarget("junk")).toBeNull();
        expect(parseTarget("")).toBeNull();
    });
});

describe("specificity", () => {
    it("is 0 for a section and 1 + path length for an element", () => {
        expect(specificity(sectionT)).toBe(0);
        expect(specificity(elEmpty)).toBe(1);
        expect(specificity(elT)).toBe(3);
    });
    it("ranks deeper elements above shallower ones", () => {
        expect(specificity(elT)).toBeGreaterThan(specificity(elEmpty));
    });
});

describe("parentTarget", () => {
    it("walks a nested element up to its parent element", () => {
        expect(parentTarget(elT)).toEqual({
            kind: "element",
            address: { section: "s", path: [0] },
        });
    });
    it("walks a root element up to its section", () => {
        expect(parentTarget(elEmpty)).toEqual({ kind: "section", section: "s" });
    });
    it("walks a section up to nothing", () => {
        expect(parentTarget(sectionT)).toBeNull();
    });
});

describe("targetsEqual", () => {
    it("compares by region id, treating nulls carefully", () => {
        expect(targetsEqual(null, null)).toBe(true);
        expect(targetsEqual(sectionT, null)).toBe(false);
        expect(targetsEqual(sectionT, { kind: "section", section: "s" })).toBe(true);
        expect(targetsEqual(sectionT, elT)).toBe(false);
    });
});

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

    it("carries an artifact-wide field an op batch never mentions", () => {
        const withPage: ArtifactContent = { ...doc("a"), page: { width: 1080, height: 1350 } };
        const r = applySectionOps(withPage, [{ kind: "remove", id: "a" }]);
        expect(r.ok && r.content.page).toEqual({ width: 1080, height: 1350 });
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

const el = (type: string, data: Record<string, unknown>): Record<string, unknown> => ({
    type,
    data,
});
const text = (style: string, t: string): Record<string, unknown> => el("text", { style, text: t });
const group = (...children: Record<string, unknown>[]): Record<string, unknown> =>
    el("group", { children });

const draft = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: group(
                text("label", "QUARTERLY"),
                text("h1", "Growth Playbook"),
                text("body", "How to monetize a freemium business"),
                el("image", { src: "https://cdn.example.com/hero.jpg", alt: "city skyline" }),
            ),
        },
        {
            id: "s2",
            root: group(
                text("h2", "Pricing ladder"),
                el("chart", {
                    type: "bar",
                    values: "10,20,30",
                    categories: "Free,Pro,Premium",
                    palette: "multi",
                }),
            ),
        },
    ],
};

describe("artifactDigest · cover", () => {
    it("reads eyebrow / title / sub by text style and the first image", () => {
        expect(artifactDigest(draft).cover).toEqual({
            eyebrow: "QUARTERLY",
            title: "Growth Playbook",
            sub: "How to monetize a freemium business",
            image: "https://cdn.example.com/hero.jpg",
        });
    });

    it("prefers a document or section background over an inline image", () => {
        const bg = { ...draft, background: { image: "bg.png" } };
        expect(artifactDigest(bg).cover.image).toBe("bg.png");
    });

    it("is empty for a contentless draft", () => {
        expect(artifactDigest({}).cover).toEqual({});
        expect(artifactDigest(null).cover).toEqual({});
        expect(artifactDigest("nonsense").cover).toEqual({});
    });
});

describe("artifactDigest · sections", () => {
    it("labels the first section cover and classifies the rest by element kind", () => {
        expect(artifactDigest(draft).sections.map(({ title, kind }) => ({ title, kind }))).toEqual([
            { title: "Growth Playbook", kind: "cover" },
            { title: "Pricing ladder", kind: "chart" },
        ]);
    });

    it("carries the section id and serialized size, for windowed loads", () => {
        const [first, second] = artifactDigest(draft).sections;
        expect(first!.id).toBe("s1");
        expect(second!.id).toBe("s2");
        expect(first!.size).toBeGreaterThan(100);
        expect(first!.size).toBe(JSON.stringify(draft.sections[0]).length);
    });

    it("skips label/caption styles when picking a section title", () => {
        const d = {
            sections: [
                { id: "a" },
                { id: "b", root: group(text("label", "SKIP"), text("h3", "Real")) },
            ],
        };
        expect(artifactDigest(d).sections[1]).toMatchObject({ title: "Real", kind: "content" });
    });

    it("clips long titles to 64 characters", () => {
        const long = "x".repeat(100);
        const d = { sections: [{ id: "a", root: text("h1", long) }] };
        expect(artifactDigest(d).sections[0]!.title).toHaveLength(64);
    });
});

describe("artifactDigest · page", () => {
    it("reads a stored page size", () => {
        expect(artifactDigest({ page: { width: 1080, height: 1350 } }).page).toEqual({
            width: 1080,
            height: 1350,
        });
    });

    it("omits the page key entirely for an artifact without one", () => {
        expect("page" in artifactDigest(draft)).toBe(false);
        expect("page" in artifactDigest({})).toBe(false);
        expect("page" in artifactDigest(undefined)).toBe(false);
    });

    it("carries the page through so library thumbnails get the true aspect", () => {
        expect(artifactDigest({ ...draft, page: { width: 1080, height: 1080 } }).page).toEqual({
            width: 1080,
            height: 1080,
        });
    });

    it("drops a malformed or non-positive page rather than trusting it", () => {
        // the digest runs against raw jsonb, so any past shape can turn up here
        expect(artifactDigest({ page: { width: "1080", height: 1350 } }).page).toBeUndefined();
        expect(artifactDigest({ page: { width: 1080 } }).page).toBeUndefined();
        expect(artifactDigest({ page: { width: 0, height: 1350 } }).page).toBeUndefined();
        expect(artifactDigest({ page: null }).page).toBeUndefined();
    });
});

describe("artifactSearchText", () => {
    it("collects prose from every nesting level, one block per section", () => {
        const out = artifactSearchText(draft);
        const [first, second] = out.split("\n\n");
        expect(first).toContain("Growth Playbook");
        expect(first).toContain("How to monetize a freemium business");
        expect(second).toContain("Pricing ladder");
        expect(second).toContain("Free,Pro,Premium");
    });

    it("keeps alt text but drops urls, colors, and enum keys", () => {
        const out = artifactSearchText(draft);
        expect(out).toContain("city skyline");
        expect(out).not.toContain("cdn.example.com");
        expect(out).not.toContain("multi"); // palette enum
        expect(out).not.toContain("studio"); // theme id lives outside sections anyway
        expect(artifactSearchText({ sections: [{ root: el("text", { color: "#ff0044" }) }] })).toBe(
            "",
        );
    });

    it("reaches text nested in table cells and diagram item strings", () => {
        const d = {
            sections: [
                {
                    root: group(
                        el("table", { cells: [text("caption", "Region"), text("caption", "ARR")] }),
                        el("diagram", { type: "flow", items: "Draft | first pass", links: "A->B" }),
                    ),
                },
            ],
        };
        const out = artifactSearchText(d);
        expect(out).toContain("Region");
        expect(out).toContain("ARR");
        expect(out).toContain("Draft | first pass");
    });

    it("drops base64-ish blobs and dedupes repeats inside a section", () => {
        const blob = "A".repeat(400);
        const d = {
            sections: [
                {
                    root: group(
                        text("body", "Repeat"),
                        text("body", "Repeat"),
                        el("image", { alt: blob }),
                    ),
                },
            ],
        };
        const out = artifactSearchText(d);
        expect(out).toBe("Repeat");
    });

    it("stops at the index cap", () => {
        const filler = "lorem ipsum ".repeat(2000); // ~24k chars per section
        const d = {
            sections: Array.from({ length: 20 }, (_, i) => ({
                root: text("body", `${i} ${filler}`),
            })),
        };
        expect(artifactSearchText(d).length).toBeLessThanOrEqual(100_000);
    });

    it("is empty for a contentless draft", () => {
        expect(artifactSearchText({})).toBe("");
        expect(artifactSearchText(undefined)).toBe("");
    });
});
