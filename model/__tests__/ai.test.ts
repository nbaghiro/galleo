import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { childrenRaw } from "@model/artifact";
import type { Generation } from "@model/ai";
import {
    applyContentOps,
    applyGenerationOps,
    applyPatch,
    blocksForLayout,
    makeBeat,
    newBeatId,
    toSectionOps,
    withDerivedBlocks,
} from "@model/ai";

const leaf = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sect = (id: string): Section => ({ id, root: leaf(id) });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const content = (sections: Section[], extra?: Partial<ArtifactContent>): ArtifactContent => ({
    format: "deck",
    theme: "base",
    sections,
    ...extra,
});
const ids = (c: ArtifactContent): string[] => c.sections.map((s) => s.id);

describe("applyContentOps · setMeta", () => {
    it("only changes the fields the op provides", () => {
        const out = applyContentOps(content([], { theme: "old", format: "deck" }), [
            { op: "setMeta", theme: "new" },
        ]);
        expect(out.theme).toBe("new");
        expect(out.format).toBe("deck");
    });
    it("clears background to undefined when given null", () => {
        const out = applyContentOps(content([], { background: { kind: "color", color: "#fff" } }), [
            { op: "setMeta", background: null },
        ]);
        expect(out.background).toBeUndefined();
    });
});

describe("applyContentOps · addSection", () => {
    it("prepends when afterId is null", () => {
        const out = applyContentOps(content([sect("a")]), [
            { op: "addSection", afterId: null, section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["b", "a"]);
    });
    it("appends when afterId is absent", () => {
        const out = applyContentOps(content([sect("a")]), [
            { op: "addSection", section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["a", "b"]);
    });
    it("appends when afterId is unknown", () => {
        const out = applyContentOps(content([sect("a")]), [
            { op: "addSection", afterId: "zzz", section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["a", "b"]);
    });
    it("inserts directly after a known afterId", () => {
        const out = applyContentOps(content([sect("a"), sect("c")]), [
            { op: "addSection", afterId: "a", section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["a", "b", "c"]);
    });
    it("moves + dedupes when re-adding an existing section id", () => {
        const out = applyContentOps(content([sect("a"), sect("b"), sect("c")]), [
            { op: "addSection", afterId: "c", section: sect("a") },
        ]);
        expect(ids(out)).toEqual(["b", "c", "a"]);
    });
});

describe("applyContentOps · replace/removeSection", () => {
    it("replaces the section with the matching id", () => {
        const out = applyContentOps(content([sect("a"), sect("b")]), [
            { op: "replaceSection", id: "b", section: { id: "b", root: leaf("NEW") } },
        ]);
        expect(textOf(out.sections[1]!.root)).toBe("NEW");
    });
    it("replaceSection is a no-op for an unknown id", () => {
        const out = applyContentOps(content([sect("a")]), [
            { op: "replaceSection", id: "zzz", section: sect("x") },
        ]);
        expect(ids(out)).toEqual(["a"]);
    });
    it("removes the section with the matching id", () => {
        const out = applyContentOps(content([sect("a"), sect("b")]), [
            { op: "removeSection", id: "a" },
        ]);
        expect(ids(out)).toEqual(["b"]);
    });
    it("removeSection is a no-op for an unknown id", () => {
        const out = applyContentOps(content([sect("a")]), [{ op: "removeSection", id: "zzz" }]);
        expect(ids(out)).toEqual(["a"]);
    });
});

describe("applyContentOps · moveSection", () => {
    it("moves a section after the target", () => {
        const out = applyContentOps(content([sect("a"), sect("b"), sect("c")]), [
            { op: "moveSection", id: "a", afterId: "c" },
        ]);
        expect(ids(out)).toEqual(["b", "c", "a"]);
    });
    it("moves a section to the front when afterId is null", () => {
        const out = applyContentOps(content([sect("a"), sect("b")]), [
            { op: "moveSection", id: "b", afterId: null },
        ]);
        expect(ids(out)).toEqual(["b", "a"]);
    });
    it("returns the same section order when the target is missing", () => {
        const out = applyContentOps(content([sect("a")]), [
            { op: "moveSection", id: "zzz", afterId: null },
        ]);
        expect(ids(out)).toEqual(["a"]);
    });
});

describe("applyContentOps · replaceElement", () => {
    const group = (children: ElementInstance[]): Section => ({
        id: "s",
        root: { type: "container", data: { children } },
    });
    it("sets the element at the path when non-null", () => {
        const out = applyContentOps(content([group([leaf("a"), leaf("b")])]), [
            { op: "replaceElement", sectionId: "s", path: [0], element: leaf("Z") },
        ]);
        expect(childrenRaw(out.sections[0]!.root)?.map(textOf)).toEqual(["Z", "b"]);
    });
    it("removes the element at the path when null", () => {
        const out = applyContentOps(content([group([leaf("a"), leaf("b")])]), [
            { op: "replaceElement", sectionId: "s", path: [0], element: null },
        ]);
        expect(childrenRaw(out.sections[0]!.root)?.map(textOf)).toEqual(["b"]);
    });
});

describe("applyContentOps · immutability", () => {
    it("never mutates the input content", () => {
        const input = content([sect("a"), sect("b")]);
        const snapshot = JSON.parse(JSON.stringify(input));
        applyContentOps(input, [
            { op: "removeSection", id: "a" },
            { op: "addSection", section: sect("z") },
        ]);
        expect(input).toEqual(snapshot);
    });
});

const gen = (over: Partial<Generation> = {}): Generation => ({
    id: "g1",
    createdAt: "2026-09-01T00:00:00.000Z",
    workspaceId: "ws",
    artifactId: "a1",
    stage: "briefed",
    brief: { prompt: "a deck", surface: "deck", theme: "studio", set: {} },
    briefVersion: 0,
    outline: null,
    plannedAgainst: null,
    steer: "",
    clarify: null,
    beats: {},
    seq: 0,
    ...over,
});
const beat = (id: string) => ({ id, label: id, role: "detail" });
const planned = (): Generation =>
    applyGenerationOps(gen(), [
        { op: "setOutline", title: "T", beats: [beat("s1"), beat("s2"), beat("s3")] },
    ]);
const beatIds = (g: Generation): string[] => (g.outline?.beats ?? []).map((b) => b.id);

describe("applyGenerationOps · setBrief", () => {
    it("a user edit sets the field, marks it, and bumps the version", () => {
        const out = applyGenerationOps(gen(), [
            { op: "setBrief", patch: { goal: "sell" }, by: "user" },
        ]);
        expect(out.brief.goal).toBe("sell");
        expect(out.brief.set.goal).toBe("user");
        expect(out.briefVersion).toBe(1);
    });
    it("the planner fills a blank without moving the version", () => {
        const out = applyGenerationOps(gen(), [
            { op: "setBrief", patch: { goal: "inform", tone: "plain" }, by: "planner" },
        ]);
        expect(out.brief.goal).toBe("inform");
        expect(out.brief.set.tone).toBe("planner");
        expect(out.briefVersion).toBe(0);
    });
    it("the planner never overwrites what the user typed", () => {
        const typed = applyGenerationOps(gen(), [
            { op: "setBrief", patch: { goal: "sell" }, by: "user" },
        ]);
        const out = applyGenerationOps(typed, [
            { op: "setBrief", patch: { goal: "inform", audience: "buyers" }, by: "planner" },
        ]);
        expect(out.brief.goal).toBe("sell");
        expect(out.brief.audience).toBe("buyers");
    });
    it("an unchanged value is not an edit", () => {
        const out = applyGenerationOps(gen(), [
            { op: "setBrief", patch: { prompt: "a deck" }, by: "user" },
        ]);
        expect(out.briefVersion).toBe(0);
    });
    it("undefined clears a field", () => {
        const typed = applyGenerationOps(gen(), [
            { op: "setBrief", patch: { goal: "sell" }, by: "user" },
        ]);
        const out = applyGenerationOps(typed, [
            { op: "setBrief", patch: { goal: undefined }, by: "user" },
        ]);
        expect(out.brief.goal).toBeUndefined();
    });
});

describe("applyGenerationOps · the outline", () => {
    it("setOutline records the brief version it was planned against and seats every beat", () => {
        const g = applyGenerationOps(gen({ briefVersion: 3 }), [
            { op: "setOutline", title: "T", beats: [beat("s1"), beat("s2")] },
        ]);
        expect(g.stage).toBe("outlined");
        expect(g.plannedAgainst).toBe(3);
        expect(Object.keys(g.beats)).toEqual(["s1", "s2"]);
        expect(g.beats.s1).toEqual({ status: "queued", versions: [], active: 0 });
    });
    it("a replan keeps the state of a beat that survives", () => {
        const written = applyGenerationOps(planned(), [
            { op: "pushVersion", id: "s2", section: sect("s2") },
        ]);
        const g = applyGenerationOps(written, [
            { op: "setOutline", title: "T2", beats: [beat("s2"), beat("s9")] },
        ]);
        expect(g.beats.s2?.status).toBe("done");
        expect(g.beats.s1).toBeUndefined();
    });
    it("adds after an anchor, at the front for null, and is idempotent on the id", () => {
        let g = applyGenerationOps(planned(), [{ op: "addBeat", afterId: "s1", beat: beat("n1") }]);
        expect(beatIds(g)).toEqual(["s1", "n1", "s2", "s3"]);
        g = applyGenerationOps(g, [{ op: "addBeat", afterId: null, beat: beat("n2") }]);
        expect(beatIds(g)).toEqual(["n2", "s1", "n1", "s2", "s3"]);
        g = applyGenerationOps(g, [{ op: "addBeat", afterId: "s1", beat: beat("n1") }]);
        expect(beatIds(g)).toEqual(["n2", "s1", "n1", "s2", "s3"]);
    });
    it("updates, removes and moves beats, dropping the state of a removed one", () => {
        let g = applyGenerationOps(planned(), [
            { op: "updateBeat", id: "s2", patch: { label: "Proof", id: "hijack" } },
        ]);
        expect(g.outline?.beats[1]).toMatchObject({ id: "s2", label: "Proof" });
        g = applyGenerationOps(g, [{ op: "moveBeat", id: "s3", afterId: null }]);
        expect(beatIds(g)).toEqual(["s3", "s1", "s2"]);
        g = applyGenerationOps(g, [{ op: "removeBeat", id: "s1" }]);
        expect(beatIds(g)).toEqual(["s3", "s2"]);
        expect(g.beats.s1).toBeUndefined();
    });
});

describe("applyGenerationOps · beats, steer, stage", () => {
    it("pushVersion marks the beat done and makes the new take active", () => {
        let g = applyGenerationOps(planned(), [
            { op: "pushVersion", id: "s1", section: sect("s1") },
        ]);
        expect(g.beats.s1).toMatchObject({ status: "done", active: 0 });
        g = applyGenerationOps(g, [{ op: "pushVersion", id: "s1", section: sect("s1") }]);
        expect(g.beats.s1?.versions).toHaveLength(2);
        expect(g.beats.s1?.active).toBe(1);
        g = applyGenerationOps(g, [{ op: "pickVersion", id: "s1", index: 0 }]);
        expect(g.beats.s1?.active).toBe(0);
        g = applyGenerationOps(g, [{ op: "pickVersion", id: "s1", index: 9 }]);
        expect(g.beats.s1?.active).toBe(1);
    });
    it("sets a beat's status, the steer note and the stage", () => {
        const g = applyGenerationOps(planned(), [
            { op: "setBeat", id: "s2", status: "failed" },
            { op: "setSteer", note: "shorter" },
            { op: "setStage", stage: "writing" },
        ]);
        expect(g.beats.s2?.status).toBe("failed");
        expect(g.steer).toBe("shorter");
        expect(g.stage).toBe("writing");
    });
    it("never mutates the input", () => {
        const input = planned();
        const snapshot = JSON.parse(JSON.stringify(input));
        applyGenerationOps(input, [
            { op: "pushVersion", id: "s1", section: sect("s1") },
            { op: "removeBeat", id: "s2" },
            { op: "setBrief", patch: { goal: "x" }, by: "user" },
        ]);
        expect(input).toEqual(snapshot);
    });
});

describe("applyPatch", () => {
    it("lands both halves together and leaves an absent target alone", () => {
        const out = applyPatch(
            { content: content([sect("a")]), generation: planned() },
            {
                artifact: [{ op: "addSection", section: sect("s1") }],
                generation: [{ op: "pushVersion", id: "s1", section: sect("s1") }],
            },
        );
        expect(ids(out.content!)).toEqual(["a", "s1"]);
        expect(out.generation?.beats.s1?.status).toBe("done");
        const only = applyPatch(
            { content: content([]) },
            { generation: [{ op: "setSteer", note: "x" }] },
        );
        expect(only.generation).toBeUndefined();
        expect(only.content).toEqual(content([]));
    });
});

describe("the beat helpers", () => {
    it("resizes blocks to the layout's column count, keeping what fits and padding with text", () => {
        expect(blocksForLayout("three-up", ["chart", "image"])).toEqual(["chart", "image", "text"]);
        expect(blocksForLayout("full", ["chart", "image"])).toEqual(["chart"]);
    });
    // The agent's revise-outline sets `layout` on its own, while the outline card always set
    // `blocks` beside it. One writer remembering and the other not is how a section became a split
    // and kept a single column's worth of blocks.
    it("brings the columns along when a layout changes, and leaves a decided patch alone", () => {
        expect(withDerivedBlocks({ layout: "three-up" }, ["chart"])).toEqual({
            layout: "three-up",
            blocks: ["chart", "text", "text"],
        });
        const decided = { layout: "two-col", blocks: ["image"] };
        expect(withDerivedBlocks(decided, ["chart"])).toBe(decided);
        const other = { takeaway: "a sharper line" };
        expect(withDerivedBlocks(other, ["chart"])).toBe(other);
    });
    it("mints a fresh non-colliding s<N> id, counting ids minted in the same batch", () => {
        const beats = [beat("s1"), beat("s2"), beat("s3")];
        expect(newBeatId(beats)).toBe("s4");
        expect(newBeatId(beats, ["s4"])).toBe("s5");
        expect(newBeatId([{ id: "s4", label: "x", role: "detail" }])).toBe("s2");
        expect(makeBeat("s9")).toMatchObject({ id: "s9", layout: "full", blocks: ["text"] });
    });
});

describe("toSectionOps", () => {
    const base = content([sect("a"), sect("b"), sect("c")]);

    it("writes an insert at the index the afterId names, and at the front for null", () => {
        expect(
            toSectionOps(base, [{ op: "addSection", afterId: "a", section: sect("z") }]),
        ).toEqual([{ kind: "insert", section: sect("z"), index: 1 }]);
        expect(
            toSectionOps(base, [{ op: "addSection", afterId: null, section: sect("z") }]),
        ).toEqual([{ kind: "insert", section: sect("z"), index: 0 }]);
    });

    it("writes a replaced section as a set and a removed one as a remove", () => {
        const fresh = { ...sect("b"), background: { kind: "color" as const, color: "#111" } };
        expect(toSectionOps(base, [{ op: "replaceSection", id: "b", section: fresh }])).toEqual([
            { kind: "set", section: fresh },
        ]);
        expect(toSectionOps(base, [{ op: "removeSection", id: "b" }])).toEqual([
            { kind: "remove", id: "b" },
        ]);
    });

    it("writes a move as the new order", () => {
        expect(toSectionOps(base, [{ op: "moveSection", id: "c", afterId: null }])).toEqual([
            { kind: "order", ids: ["c", "a", "b"] },
        ]);
    });

    it("writes a meta change as the whole shell, the way every emitter does", () => {
        const ops = toSectionOps(base, [{ op: "setMeta", theme: "couture" }]);
        expect(ops).toEqual([{ kind: "shell", shell: { format: base.format, theme: "couture" } }]);
    });

    it("writes nothing for a patch that changes nothing", () => {
        expect(toSectionOps(base, [])).toEqual([]);
    });
});
