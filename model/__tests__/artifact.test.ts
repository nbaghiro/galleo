import { describe, expect, it } from "vitest";
import type {
    ArtifactContent,
    ElementInstance,
    Section,
    SectionNotes,
    SectionOp,
    Target,
} from "@model/artifact";
import {
    LAYOUT_PRESETS,
    applySectionOps,
    datumRegionId,
    elementRegionId,
    hitRegionId,
    parseDatumRegion,
    parseHitRegion,
    invertOps,
    narrowOps,
    artifactDigest,
    artifactSearchText,
    needsScript,
    scriptStale,
    sectionFingerprint,
    sectionText,
    unscripted,
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
    withoutNotes,
    duckedVolume,
    toContainer,
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

describe("datumRegionId ⇄ parseDatumRegion", () => {
    const el = elementRegionId({ section: "s1", path: [0, 2] });

    it("round-trips through an element region id that has its own colons", () => {
        expect(parseDatumRegion(datumRegionId(el, 7))).toEqual({ element: el, index: 7 });
    });

    it("round-trips a pathless element", () => {
        const root = elementRegionId({ section: "s1", path: [] });
        expect(parseDatumRegion(datumRegionId(root, 0))).toEqual({ element: root, index: 0 });
    });

    it("returns null for anything that is not a datum", () => {
        expect(parseDatumRegion(el)).toBeNull();
        expect(parseDatumRegion(hitRegionId("toggle", { section: "s1", path: [0] }))).toBeNull();
        expect(parseDatumRegion("datum:el:s1:x")).toBeNull();
        expect(parseDatumRegion("datum:")).toBeNull();
    });

    // hover and selection read the same region list, so a datum must be invisible to selection
    it("is not a selection target, and not an affordance", () => {
        const id = datumRegionId(el, 3);
        expect(parseTarget(id)).toBeNull();
        expect(parseHitRegion(id)).toBeNull();
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

// The per-property unit collaboration writes: one element's data keys, merged rather than replaced,
// so an inspector's colour write and a text session's {text, marks} write never fight.
const tree = (id: string, data: Record<string, unknown>): ElementInstance => ({
    type: "text",
    id,
    data,
});
const nested = (id: string, kids: ElementInstance[]): Section => ({
    id,
    root: { type: "container", id: `g-${id}`, data: { direction: "col", children: kids } },
});
const dataDoc = (): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [
        nested("s1", [tree("e1", { text: "one", color: "red" }), tree("e2", { text: "two" })]),
        nested("s2", [tree("e3", { text: "three" })]),
    ],
});
const elementById = (c: ArtifactContent, id: string): ElementInstance | undefined => {
    let found: ElementInstance | undefined;
    const walk = (el: ElementInstance): void => {
        if (el.id === id) found = el;
        for (const kid of (el.data as { children?: ElementInstance[] }).children ?? []) walk(kid);
    };
    for (const s of c.sections) walk(s.root);
    return found;
};

describe("the data op", () => {
    it("merges the named keys and leaves the rest of the element alone", () => {
        const before = dataDoc();
        const r = applySectionOps(before, [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } },
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(elementById(r.content, "e1")?.data).toEqual({ text: "one", color: "blue" });
    });

    it("finds the element anywhere in the section tree, not only at the root", () => {
        const r = applySectionOps(dataDoc(), [
            { kind: "data", sectionId: "s2", elementId: "e3", keys: { text: "III" } },
        ]);
        expect(r.ok && (elementById(r.content, "e3")?.data as { text: string }).text).toBe("III");
    });

    // The per-section paint cache and the autosave diff both key on object identity, so a remote op
    // that rebuilt untouched nodes would repaint the whole document and resend it.
    it("preserves object identity for every untouched section and element", () => {
        const before = dataDoc();
        const r = applySectionOps(before, [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } },
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // the untouched section is the very same object
        expect(r.content.sections[1]).toBe(before.sections[1]);
        // so is the untouched sibling inside the section that did change
        expect(elementById(r.content, "e2")).toBe(elementById(before, "e2"));
        // and the touched element is a new object, so a paint cache sees the change
        expect(elementById(r.content, "e1")).not.toBe(elementById(before, "e1"));
        expect(before.sections[0]!.root).not.toBe(r.content.sections[0]!.root);
    });

    it("returns the same section object when the keys already hold those values", () => {
        const before = dataDoc();
        const r = applySectionOps(before, [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "red" } },
        ]);
        expect(r.ok && r.content.sections[0]).toBe(before.sections[0]);
    });

    it("rejects the batch on an unknown element or section, like every other op", () => {
        expect(
            applySectionOps(dataDoc(), [
                { kind: "data", sectionId: "s1", elementId: "ghost", keys: { text: "x" } },
            ]).ok,
        ).toBe(false);
        expect(
            applySectionOps(dataDoc(), [
                { kind: "data", sectionId: "ghost", elementId: "e1", keys: { text: "x" } },
            ]).ok,
        ).toBe(false);
    });

    it("leaves the input untouched", () => {
        const before = dataDoc();
        applySectionOps(before, [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } },
        ]);
        expect((elementById(before, "e1")?.data as { color: string }).color).toBe("red");
    });
});

describe("narrowOps", () => {
    const withText = (doc: ArtifactContent, sectionId: string, i: number, text: string) => {
        const section = doc.sections.find((s) => s.id === sectionId)!;
        const kids = (section.root.data as { children: ElementInstance[] }).children;
        const next = kids.map((k, at) =>
            at === i ? { ...k, data: { ...(k.data as object), text } } : k,
        );
        return {
            ...section,
            root: { ...section.root, data: { ...(section.root.data as object), children: next } },
        };
    };

    it("rewrites a section set that is nothing but one element's data", () => {
        const before = dataDoc();
        const ops = narrowOps(before, [
            { kind: "set", section: withText(before, "s1", 0, "changed") },
        ]);
        expect(ops).toEqual([
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "changed" } },
        ]);
    });

    it("names only the keys that actually changed", () => {
        const before = dataDoc();
        const section = before.sections[0]!;
        const kids = (section.root.data as { children: ElementInstance[] }).children;
        const next = {
            ...section,
            root: {
                ...section.root,
                data: {
                    ...(section.root.data as object),
                    children: [{ ...kids[0]!, data: { text: "one", color: "blue" } }, kids[1]!],
                },
            },
        };
        expect(narrowOps(before, [{ kind: "set", section: next }])).toEqual([
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } },
        ]);
    });

    it("records a removed key as null, which is what the wire can carry", () => {
        const before = dataDoc();
        const section = before.sections[0]!;
        const kids = (section.root.data as { children: ElementInstance[] }).children;
        const next = {
            ...section,
            root: {
                ...section.root,
                data: {
                    ...(section.root.data as object),
                    children: [{ ...kids[0]!, data: { text: "one" } }, kids[1]!],
                },
            },
        };
        expect(narrowOps(before, [{ kind: "set", section: next }])).toEqual([
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: null } },
        ]);
    });

    it("emits one op per element when two of them changed at once", () => {
        let next = withText(dataDoc(), "s1", 0, "A");
        const before = dataDoc();
        const kids = (next.root.data as { children: ElementInstance[] }).children;
        next = {
            ...next,
            root: {
                ...next.root,
                data: {
                    ...(next.root.data as object),
                    children: [kids[0]!, { ...kids[1]!, data: { text: "B" } }],
                },
            },
        };
        const ops = narrowOps(before, [{ kind: "set", section: next }]);
        expect(ops.map((o) => (o.kind === "data" ? o.elementId : o.kind))).toEqual(["e1", "e2"]);
    });

    it("leaves a structural change as a whole-section set", () => {
        const before = dataDoc();
        const section = before.sections[0]!;
        const kids = (section.root.data as { children: ElementInstance[] }).children;
        const added = {
            ...section,
            root: {
                ...section.root,
                data: {
                    ...(section.root.data as object),
                    children: [...kids, { type: "text", id: "e9", data: { text: "new" } }],
                },
            },
        };
        expect(narrowOps(before, [{ kind: "set", section: added }])[0]?.kind).toBe("set");
    });

    it("leaves a layout change, a type change, and a section-shell change as sets", () => {
        const before = dataDoc();
        const section = before.sections[0]!;
        const kids = (section.root.data as { children: ElementInstance[] }).children;
        const swap = (child: ElementInstance) => ({
            ...section,
            root: {
                ...section.root,
                data: {
                    ...(section.root.data as object),
                    children: [child, kids[1]!],
                },
            },
        });
        const resized = swap({ ...kids[0]!, layout: { width: { pct: 40 } } });
        const retyped = swap({ ...kids[0]!, type: "quote" });
        expect(narrowOps(before, [{ kind: "set", section: resized }])[0]?.kind).toBe("set");
        expect(narrowOps(before, [{ kind: "set", section: retyped }])[0]?.kind).toBe("set");
        const painted = { ...section, background: { kind: "color" as const, color: "#000" } };
        expect(narrowOps(before, [{ kind: "set", section: painted }])[0]?.kind).toBe("set");
    });

    it("keeps a set for an element that has no id to address yet", () => {
        const before: ArtifactContent = {
            format: "deck",
            theme: "studio",
            sections: [nested("s1", [{ type: "text", data: { text: "one" } }])],
        };
        const section = before.sections[0]!;
        const next = {
            ...section,
            root: {
                ...section.root,
                data: {
                    ...(section.root.data as object),
                    children: [{ type: "text", data: { text: "two" } }],
                },
            },
        };
        expect(narrowOps(before, [{ kind: "set", section: next }])[0]?.kind).toBe("set");
    });

    it("drops a set that changed nothing, and passes every other op kind through", () => {
        const before = dataDoc();
        expect(narrowOps(before, [{ kind: "set", section: before.sections[0]! }])).toEqual([]);
        const rest: SectionOp[] = [
            { kind: "remove", id: "s2" },
            { kind: "order", ids: ["s2", "s1"] },
            { kind: "shell", shell: { format: "doc", theme: "studio" } },
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "x" } },
        ];
        expect(narrowOps(before, rest)).toEqual(rest);
    });

    it("narrows to ops that reproduce the same document", () => {
        const before = dataDoc();
        const next = {
            ...before,
            sections: [withText(before, "s1", 0, "rewritten"), before.sections[1]!],
        };
        const narrowed = narrowOps(before, [{ kind: "set", section: next.sections[0]! }]);
        const applied = applySectionOps(before, narrowed);
        expect(applied.ok && elementById(applied.content, "e1")?.data).toEqual({
            text: "rewritten",
            color: "red",
        });
        // and the untouched section keeps its object, which the whole-section set would not have
        expect(applied.ok && applied.content.sections[1]).toBe(before.sections[1]);
    });

    // A notes-only edit leaves the tree identical, so dataDelta returns [] — truthy — and without
    // `notes` in SECTION_SHELL_EQUAL the set narrows to zero ops and the edit never reaches the row.
    it("keeps a notes-only edit as a whole-section set", () => {
        const before = dataDoc();
        const next: Section = { ...before.sections[0]!, notes: { spoken: "say this" } };
        const ops = narrowOps(before, [{ kind: "set", section: next }]);
        expect(ops).toEqual([{ kind: "set", section: next }]);
        const applied = applySectionOps(before, ops);
        expect(applied.ok && applied.content.sections[0]?.notes).toEqual({ spoken: "say this" });
    });

    // same hazard as `notes`: pinning changes nothing in the tree, so the set has to survive on the
    // shell comparison alone or the toggle silently never reaches the row
    it("keeps a pinned-only edit as a whole-section set", () => {
        const before = dataDoc();
        const next: Section = { ...before.sections[0]!, pinned: true };
        const ops = narrowOps(before, [{ kind: "set", section: next }]);
        expect(ops).toEqual([{ kind: "set", section: next }]);
        const applied = applySectionOps(before, ops);
        expect(applied.ok && applied.content.sections[0]?.pinned).toBe(true);
    });

    // A background is a shell field too, and `tone` is one this layer never enumerates: it has to
    // ride to the row on the whole-section set rather than being narrowed away or rebuilt.
    it("carries a background tone through a section set untouched", () => {
        const before = dataDoc();
        const background = { kind: "tone", tone: "contrast" } as const;
        const next: Section = { ...before.sections[0]!, background };
        const ops = narrowOps(before, [{ kind: "set", section: next }]);
        expect(ops).toEqual([{ kind: "set", section: next }]);
        const applied = applySectionOps(before, ops);
        expect(applied.ok && applied.content.sections[0]?.background).toEqual(background);
    });

    it("keeps a set that changes notes and element data together", () => {
        const before = dataDoc();
        const edited = withText(before, "s1", 0, "changed");
        const next: Section = { ...edited, notes: { spoken: "and say this" } };
        expect(narrowOps(before, [{ kind: "set", section: next }])[0]?.kind).toBe("set");
    });
});

describe("diffSections — the shell", () => {
    const shell = (over: Partial<ArtifactContent> = {}): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [],
        ...over,
    });

    it("emits nothing when the shell is unchanged", () => {
        expect(diffSections(shell(), shell())).toEqual([]);
    });

    // The hand-listed version compared format, theme and background only, so adding `voice` made a
    // voice-only change diff to zero ops and the choice never reached the row.
    it("notices a change to any shell field, named here or added later", () => {
        for (const over of [
            { theme: "other" },
            { format: "doc" },
            { voice: "v1" },
            { page: { width: 1, height: 2 } },
        ] as Partial<ArtifactContent>[]) {
            const ops = diffSections(shell(), shell(over));
            expect(ops).toHaveLength(1);
            expect(ops[0]?.kind).toBe("shell");
        }
    });

    it("carries the whole shell, so applying one change keeps the others", () => {
        const before = shell({ voice: "v1", page: { width: 1, height: 2 } });
        const after = { ...before, theme: "other" };
        const applied = applySectionOps(before, diffSections(before, after));
        expect(applied.ok && applied.content).toMatchObject({
            theme: "other",
            voice: "v1",
            page: { width: 1, height: 2 },
        });
    });

    it("round-trips a removed shell field rather than leaving it behind", () => {
        const before = shell({ voice: "v1" });
        const after = shell();
        const applied = applySectionOps(before, diffSections(before, after));
        expect(applied.ok && applied.content.voice).toBeUndefined();
    });
});

describe("withoutNotes", () => {
    const noted = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: leaf("one"),
                notes: { spoken: "script", cues: ["do not mention Q3"] },
            },
            { id: "s2", root: leaf("two") },
        ],
    });

    it("removes the notes key entirely rather than blanking it", () => {
        const stripped = withoutNotes(noted());
        expect(stripped.sections[0]).not.toHaveProperty("notes");
        expect(JSON.stringify(stripped)).not.toContain("do not mention Q3");
    });

    it("leaves everything else alone, including the section's own identity", () => {
        const before = noted();
        const stripped = withoutNotes(before);
        expect(stripped.sections[0]?.root).toBe(before.sections[0]!.root);
        expect(stripped.sections[1]).toBe(before.sections[1]);
        expect(stripped.format).toBe("deck");
    });

    it("returns the same object when no section carries notes", () => {
        const plain: ArtifactContent = {
            format: "doc",
            theme: "studio",
            sections: [{ id: "s1", root: leaf("one") }],
        };
        expect(withoutNotes(plain)).toBe(plain);
    });
});

describe("invertOps", () => {
    it("turns a data op into the prior values of exactly the keys it touched", () => {
        const before = dataDoc();
        const forward: SectionOp[] = [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } },
        ];
        const inverse = invertOps(before, forward);
        const applied = applySectionOps(before, forward);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const back = applySectionOps(applied.content, inverse);
        expect(back.ok && elementById(back.content, "e1")?.data).toEqual({
            text: "one",
            color: "red",
        });
    });

    it("records undefined for a key the element did not have, so undo removes it", () => {
        const before = dataDoc();
        const forward: SectionOp[] = [
            { kind: "data", sectionId: "s1", elementId: "e2", keys: { color: "green" } },
        ];
        const applied = applySectionOps(before, forward);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const back = applySectionOps(applied.content, invertOps(before, forward));
        expect(back.ok && elementById(back.content, "e2")?.data).toEqual({ text: "two" });
    });

    it("inverts set, insert, remove, order, and shell back to the previous document", () => {
        const before = doc("a", "b", "c");
        const forward: SectionOp[] = [
            { kind: "set", section: sec("b", "rewritten") },
            { kind: "remove", id: "c" },
            { kind: "insert", section: sec("d"), index: 0 },
            { kind: "order", ids: ["b", "d", "a"] },
            { kind: "shell", shell: { format: "doc", theme: "aurora" } },
        ];
        const applied = applySectionOps(before, forward);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const back = applySectionOps(applied.content, invertOps(before, forward));
        expect(back.ok).toBe(true);
        if (!back.ok) return;
        expect(idsOf(back.content)).toEqual(["a", "b", "c"]);
        expect((back.content.sections[1]!.root.data as { text: string }).text).toBe("b");
        expect(back.content.format).toBe("deck");
        expect(back.content.theme).toBe("studio");
    });

    it("round-trips an op batch that only reorders", () => {
        const before = doc("a", "b", "c");
        const forward: SectionOp[] = [{ kind: "order", ids: ["c", "b", "a"] }];
        const applied = applySectionOps(before, forward);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const back = applySectionOps(applied.content, invertOps(before, forward));
        expect(back.ok && idsOf(back.content)).toEqual(["a", "b", "c"]);
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

describe("affordance regions", () => {
    it("round-trips action + address, root paths included", () => {
        const addr = { section: "s1", path: [0, 2] };
        expect(parseHitRegion(hitRegionId("checkbox", addr))).toEqual({
            action: "checkbox",
            address: addr,
        });
        expect(parseHitRegion(hitRegionId("checkbox", { section: "s1", path: [] }))).toEqual({
            action: "checkbox",
            address: { section: "s1", path: [] },
        });
    });

    it("is invisible to selection parsing, and vice versa", () => {
        const id = hitRegionId("checkbox", { section: "s1", path: [1] });
        expect(parseTarget(id)).toBeNull();
        expect(parseHitRegion("el:s1:1")).toBeNull();
        expect(parseHitRegion("section:s1")).toBeNull();
    });
});

describe("toContainer", () => {
    it("renames a group and leaves its data alone", () => {
        const out = toContainer({ type: "group", data: { direction: "row", children: [] } });
        expect(out.type).toBe("container");
        expect(out.data).toEqual({ direction: "row", children: [] });
    });

    // a card with no explicit style still rendered solid, so the default is filled in, not dropped
    it("maps a card's style onto surface, defaulting to solid", () => {
        expect(toContainer({ type: "card", data: { children: [] } }).data).toEqual({
            children: [],
            surface: "solid",
        });
        expect(
            toContainer({ type: "card", data: { children: [], style: "outline", bg: "#fff" } })
                .data,
        ).toEqual({ children: [], surface: "outline", bg: "#fff" });
    });

    it("recurses, including through a closed unit's children", () => {
        const out = toContainer({
            type: "table",
            data: { cells: [{ type: "card", data: { children: [] } }] },
            // table stores cells under its own key, so this exercises childrenRaw's contract
        });
        expect(out.type).toBe("table");
    });

    it("converts nested groups and cards at every depth", () => {
        const tree = toContainer({
            type: "group",
            data: {
                children: [
                    { type: "card", data: { children: [{ type: "text", data: { text: "a" } }] } },
                    { type: "group", data: { children: [] } },
                ],
            },
        });
        const kids = (tree.data as { children: ElementInstance[] }).children;
        expect(tree.type).toBe("container");
        expect(kids.map((k) => k.type)).toEqual(["container", "container"]);
    });

    it("returns the same object when nothing changed, so a caller can skip the write", () => {
        const clean: ElementInstance = { type: "container", data: { children: [] } };
        expect(toContainer(clean)).toBe(clean);
    });

    it("is idempotent, so a half-finished run is safe to repeat", () => {
        const once = toContainer({ type: "card", data: { children: [], style: "plain" } });
        expect(toContainer(once)).toBe(once);
    });
});

describe("duckedVolume", () => {
    it("leaves the bed at its own level when nothing is being said", () => {
        expect(duckedVolume(0.35, false)).toBeCloseTo(0.35);
    });

    it("drops it hard while a voice speaks, which is the whole point", () => {
        expect(duckedVolume(0.35, true)).toBeLessThan(0.35 / 2);
    });

    it("never leaves the 0..1 an audio element accepts", () => {
        expect(duckedVolume(5, false)).toBe(1);
        expect(duckedVolume(-1, false)).toBe(0);
        expect(duckedVolume(1, true)).toBeLessThanOrEqual(1);
    });

    it("stays silent when the bed is muted, speaking or not", () => {
        expect(duckedVolume(0, false)).toBe(0);
        expect(duckedVolume(0, true)).toBe(0);
    });
});

describe("sectionText", () => {
    const sec = (root: ElementInstance): Section => ({ id: "s1", root });

    it("reads the words out of the tree, in order", () => {
        const got = sectionText(
            sec({
                type: "stack",
                data: {
                    children: [
                        { type: "text", data: { text: "A headline" } },
                        { type: "text", data: { text: "and a subhead" } },
                    ],
                },
            }),
        );
        expect(got).toBe("A headline and a subhead");
    });

    it("leaves out ids, colors and urls, which are not what a script is about", () => {
        const got = sectionText(
            sec({
                type: "image",
                data: { color: "#ff0000", src: "https://example.com/a.png", align: "left" },
            }),
        );
        expect(got).toBe("");
    });

    it("says nothing for a section with no words at all", () => {
        expect(sectionText(sec({ type: "spacer", data: {} }))).toBe("");
    });
});

describe("sectionFingerprint", () => {
    const words = (text: string): Section => ({ id: "s1", root: { type: "text", data: { text } } });

    it("is stable for the same words", () => {
        expect(sectionFingerprint(words("A headline"))).toBe(
            sectionFingerprint(words("A headline")),
        );
    });

    it("moves when the words do", () => {
        expect(sectionFingerprint(words("A headline"))).not.toBe(
            sectionFingerprint(words("A different headline")),
        );
    });

    // the script describes what is said, not where it sits, so a nudge must not invalidate it
    it("ignores everything that is not the words", () => {
        const base = words("A headline");
        const moved: Section = {
            ...base,
            bleed: true,
            background: { kind: "color", color: "#123456" },
            notes: { spoken: "something else entirely" },
        };
        expect(sectionFingerprint(moved)).toBe(sectionFingerprint(base));
    });
});

describe("scriptStale", () => {
    const scripted = (text: string, notes: SectionNotes): Section => ({
        id: "s1",
        root: { type: "text", data: { text } },
        notes,
    });

    it("is true when AI notes were written against copy that has since changed", () => {
        const before = scripted("A headline", { spoken: "we say this", source: "ai" });
        const stamped = scripted("A headline", {
            spoken: "we say this",
            source: "ai",
            of: sectionFingerprint(before),
        });
        expect(scriptStale(stamped)).toBe(false);
        expect(
            scriptStale({ ...stamped, root: { type: "text", data: { text: "Rewritten" } } }),
        ).toBe(true);
    });

    // rewriting what a person wrote is not a cache decision, whatever the fingerprint says
    it("is never true for notes a person wrote", () => {
        const s = scripted("A headline", { spoken: "mine", source: "human", of: "deadbeef" });
        expect(scriptStale(s)).toBe(false);
    });

    // a deploy must not rewrite every script in the product at once
    it("treats notes written before fingerprinting as current", () => {
        expect(scriptStale(scripted("A headline", { spoken: "old", source: "ai" }))).toBe(false);
    });

    it("is false when there is nothing written yet", () => {
        expect(scriptStale(scripted("A headline", { spoken: "   ", source: "ai" }))).toBe(false);
    });
});

describe("needsScript", () => {
    const bare: Section = { id: "s1", root: { type: "text", data: { text: "A headline" } } };

    it("is true for a section nobody has written for", () => {
        expect(needsScript(bare)).toBe(true);
        expect(unscripted(bare)).toBe(true);
    });

    it("is false once it has something to say that still fits", () => {
        const s: Section = {
            ...bare,
            notes: { spoken: "we say this", source: "ai", of: sectionFingerprint(bare) },
        };
        expect(needsScript(s)).toBe(false);
    });

    it("is true again after the copy moves out from under an AI script", () => {
        const s: Section = {
            ...bare,
            notes: { spoken: "we say this", source: "ai", of: sectionFingerprint(bare) },
            root: { type: "text", data: { text: "Something else" } },
        };
        expect(needsScript(s)).toBe(true);
    });
});
