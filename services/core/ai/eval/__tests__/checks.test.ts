import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { CHECKS, failures, runChecks } from "@services/core/ai/eval/checks";
import { galleo } from "@services/core/ai/corpus/galleo";

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });

const group = (children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});

const section = (id: string, children: ElementInstance[]): Section => ({
    id,
    root: group(children),
});

const artifact = (sections: Section[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections,
});

const ctx = { surface: "deck", length: "Short" };

const failed = (c: ArtifactContent, id: string): boolean =>
    failures(runChecks(c, ctx)).some((f) => f.id === id);

describe("the check registry", () => {
    it("gives every check a unique id", () => {
        expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length);
    });

    it("gives every check something to run", () => {
        for (const c of CHECKS) expect(c.section ?? c.artifact).toBeTruthy();
    });
});

describe("content checks", () => {
    it("catches placeholder copy", () => {
        expect(
            failed(
                artifact([section("a", [text("Lorem ipsum dolor sit amet")])]),
                "placeholder-copy",
            ),
        ).toBe(true);
    });

    it("passes real copy", () => {
        expect(
            failed(
                artifact([section("a", [text("Expense reports close in four days.")])]),
                "placeholder-copy",
            ),
        ).toBe(false);
    });

    it("catches a slide carrying a document's worth of words", () => {
        const wall = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
        expect(failed(artifact([section("a", [text(wall)])]), "body-copy-length")).toBe(true);
    });

    it("allows the same wall in a doc, where it is not a defect", () => {
        const wall = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
        const results = runChecks(artifact([section("a", [text(wall)])]), {
            surface: "doc",
            length: "Short",
        });
        expect(failures(results).some((f) => f.id === "body-copy-length")).toBe(false);
    });
});

describe("structure checks", () => {
    it("catches two sections with the same title", () => {
        const c = artifact([section("a", [text("Our plan")]), section("b", [text("Our plan")])]);
        expect(failed(c, "duplicate-labels")).toBe(true);
    });

    it("catches a length that misses the brief badly", () => {
        const one = artifact([section("a", [text("Only section here")])]);
        expect(failed(one, "section-count")).toBe(true); // 1 where Short wants ~7
    });

    it("tolerates a planner that breathes a little", () => {
        const six = artifact(
            Array.from({ length: 6 }, (_, i) => section(`s${i}`, [text(`Section ${i} copy`)])),
        );
        expect(failed(six, "section-count")).toBe(false);
    });

    it("catches an empty section", () => {
        expect(failed(artifact([section("a", [])]), "empty-sections")).toBe(true);
    });
});

describe("variety checks", () => {
    it("catches three sections in a row with the same shape", () => {
        const same = (id: string): Section => section(id, [text("Title"), text("Body copy here")]);
        expect(failed(artifact([same("a"), same("b"), same("c")]), "layout-repetition")).toBe(true);
    });

    it("passes when only two in a row match", () => {
        const same = (id: string): Section => section(id, [text("Title"), text("Body copy here")]);
        const other = section("c", [text("Just one")]);
        expect(failed(artifact([same("a"), same("b"), other]), "layout-repetition")).toBe(false);
    });
});

describe("against the corpus, which is the quality bar", () => {
    it("does not accuse a hand-built artifact of being empty or placeholder-filled", () => {
        const bad = failures(runChecks(galleo, { surface: "deck", length: "In-depth" }));
        const ids = new Set(bad.map((f) => f.id));
        expect(ids.has("placeholder-copy")).toBe(false);
        expect(ids.has("empty-sections")).toBe(false);
        expect(ids.has("has-content")).toBe(false);
    });

    // a rate, not a count: the corpus has 19 sections to the fixture's 2, so absolute failures
    // are not comparable across artifacts of different size
    const faultRate = (c: ArtifactContent, cx = ctx): number => {
        const all = runChecks(c, cx);
        return failures(all).length / all.length;
    };

    // Calibration guard. The corpus IS the bar, so a check it fails is measuring the threshold
    // rather than the work. Kept above zero on purpose: a check that can never fire is worthless.
    it("stays near-clean on the bar, so a too-aggressive check fails here first", () => {
        expect(faultRate(galleo, { surface: "deck", length: "In-depth" })).toBeLessThan(0.03);
    });

    it("finds proportionally fewer faults in it than in a deliberately broken artifact", () => {
        const broken = artifact([section("a", [text("TBD")]), section("b", [text("TBD")])]);
        expect(faultRate(galleo, { surface: "deck", length: "In-depth" })).toBeLessThan(
            faultRate(broken),
        );
    });
});
