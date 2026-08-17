import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypeFitsRole, roleWants } from "@model/eval";
import { measure } from "@canvas/testkit";
import "@elements/register";
import { classifySections } from "@canvas/render/archetype";
import { fitChecks } from "@canvas/render/fit-checks";
import { profileFor } from "@engine/profile";
import { THEMES } from "@themes";
import { galleo } from "@services/core/ai/corpus/galleo";
import { aria } from "@services/core/ai/corpus/aria";
import { helios } from "@services/core/ai/corpus/helios";
import { lumen } from "@services/core/ai/corpus/lumen";
import { terra } from "@services/core/ai/corpus/terra";
import { slowweb } from "@services/core/ai/corpus/slowweb";
import { fieldnotes } from "@services/core/ai/corpus/fieldnotes";

const W = 1280;
const CORPUS = { galleo, aria, helios, lumen, terra, slowweb, fieldnotes };

const shapesOf = (c: (typeof CORPUS)[keyof typeof CORPUS]) =>
    classifySections(c.sections, W, measure, THEMES[c.theme]?.tokens, profileFor(c));

describe("archetype classification", () => {
    it("gives every corpus section exactly one known archetype", () => {
        for (const [name, content] of Object.entries(CORPUS))
            for (const s of shapesOf(content))
                expect(ARCHETYPES, `${name}/${s.id}`).toContain(s.archetype);
    });

    it("is deterministic — the same section classifies the same way twice", () => {
        const a = shapesOf(galleo).map((s) => s.archetype);
        const b = shapesOf(galleo).map((s) => s.archetype);
        expect(a).toEqual(b);
    });

    // the corpus IS the quality bar: hand-built decks must not read as one shape repeated
    it("finds real variety across the hand-built corpus", () => {
        for (const [name, content] of Object.entries(CORPUS)) {
            const shapes = shapesOf(content);
            if (shapes.length < 4) continue;
            const distinct = new Set(shapes.map((s) => s.archetype));
            expect(distinct.size, `${name} is all ${[...distinct].join("/")}`).toBeGreaterThan(1);
        }
    });

    // rhythm reads the fine key, so a chart then a diagram then a table is variety, not repetition
    it("never runs three identical shapes in a row in the corpus", () => {
        for (const [name, content] of Object.entries(CORPUS)) {
            const a = shapesOf(content).map((s) => s.key);
            for (let i = 2; i < a.length; i++)
                expect(
                    a[i] === a[i - 1] && a[i] === a[i - 2],
                    `${name} repeats ${a[i]} at ${i - 1}–${i + 1}`,
                ).toBe(false);
        }
    });
});

describe("role expectations", () => {
    it("every role wants at least one archetype, and only known ones", () => {
        for (const role of ["scene", "tension", "turn", "proof", "momentum", "close"]) {
            const wants = roleWants(role);
            expect(wants, role).toBeTruthy();
            for (const a of wants!) expect(ARCHETYPES).toContain(a);
        }
    });

    it("treats an unknown role as always satisfied, so a missing arc never fails a render", () => {
        expect(roleWants(undefined)).toBeNull();
        for (const a of ARCHETYPES) expect(archetypeFitsRole("nonsense", a)).toBe(true);
    });

    it("holds the opinions that make the table worth having", () => {
        expect(archetypeFitsRole("proof", "data")).toBe(true);
        expect(archetypeFitsRole("proof", "statement")).toBe(false); // proof needs evidence
        expect(archetypeFitsRole("close", "data")).toBe(false); // a close commits
        expect(archetypeFitsRole("scene", "grid")).toBe(false); // an opener is not a card wall
    });
});

/**
 * `@canvas/testkit`'s measurer is 8px per character with a flat 16px line height whatever the font
 * size, so a headline measures as tall as body copy and every section comes out far shorter than it
 * really is. That makes the two height-derived checks meaningless here; they are calibrated against
 * the painter's own `measureText` in the app. Everything below is height-independent.
 */
const HEIGHT_DERIVED = new Set(["fills-frame", "fits-frame"]);

const failuresFor = (content: (typeof CORPUS)[keyof typeof CORPUS], meta?: undefined) =>
    fitChecks(content, meta, measure)
        .filter((c) => !c.pass && !HEIGHT_DERIVED.has(c.id))
        .map((c) => `${c.target} ${c.id} (${c.detail ?? ""})`);

describe("shape checks over the corpus", () => {
    // the corpus IS the quality bar: a check the hand-built work fails is miscalibrated by definition
    it("passes every height-independent check on all seven", () => {
        for (const [name, content] of Object.entries(CORPUS)) {
            const failed = failuresFor(content);
            expect(failed, `${name}: ${failed.join("; ")}`).toEqual([]);
        }
    });

    it("reads legible contrast everywhere the corpus paints text on a flat fill", () => {
        for (const [name, content] of Object.entries(CORPUS)) {
            const bad = fitChecks(content, undefined, measure).filter(
                (c) => c.id === "text-is-legible" && !c.pass,
            );
            expect(
                bad.map((c) => `${c.target} ${c.detail}`),
                name,
            ).toEqual([]);
        }
    });

    it("holds a section to its beat when the outline named one", () => {
        const shapes = shapesOf(galleo);
        const meta = {
            at: "",
            models: {},
            prompt: "",
            surface: "deck",
            // claim the opener is a proof beat: a bleed cannot satisfy that
            beats: [{ id: shapes[0]!.id, label: "x", role: "proof" }],
        };
        const check = fitChecks(galleo, meta, measure).find((c) => c.id === "suits-its-beat");
        expect(check).toBeTruthy();
        expect(check!.pass).toBe(false);
        expect(check!.detail).toContain("proof");
    });

    it("stands the role check down when the outline named no beats", () => {
        expect(fitChecks(galleo, undefined, measure).some((c) => c.id === "suits-its-beat")).toBe(
            false,
        );
    });
});
