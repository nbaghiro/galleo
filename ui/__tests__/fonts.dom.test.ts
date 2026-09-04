// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import {
    createSectionStackCache,
    paintSectionStack,
    type SectionStackCache,
} from "@canvas/render/backends";
import { resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

// happy-dom ships no FontFaceSet, so the platform seam is stubbed the way installCanvas2D stubs the
// 2D context. It has to exist before the module under test is imported, which is what binds it.
const faces = new EventTarget() as EventTarget & { ready: Promise<unknown> };
faces.ready = Promise.resolve();
Object.defineProperty(document, "fonts", { value: faces, configurable: true });

let fontsGeneration: () => number;
let createFontsInvalidator: (cache: SectionStackCache) => () => void;

const settle = (): void => {
    faces.dispatchEvent(new Event("loadingdone"));
};

const sections = [sectionOf(inst("text", { text: "Wraps against real metrics" }), { id: "s0" })];

beforeAll(async () => {
    installCanvas2D();
    const mod = await import("@ui/fonts");
    fontsGeneration = mod.fontsGeneration;
    createFontsInvalidator = mod.createFontsInvalidator;
});

describe("fontsGeneration", () => {
    it("advances every time the browser settles a batch of faces", () => {
        const before = fontsGeneration();
        settle();
        expect(fontsGeneration()).toBe(before + 1);
        settle();
        expect(fontsGeneration()).toBe(before + 2);
    });
});

describe("createFontsInvalidator", () => {
    it("makes the surface re-lay-out rather than serve its fallback-metric layer", () => {
        const cache = createSectionStackCache();
        const fontsSettled = createFontsInvalidator(cache);
        const host = document.createElement("div");
        const draw = (): void => {
            fontsSettled();
            paintSectionStack(host, sections, resolveProfile("deck"), tokens, {
                fullW: 1000,
                cache,
            });
        };

        draw();
        const first = cache.entries.get("s0");
        expect(first).toBeTruthy();
        draw();
        expect(cache.entries.get("s0")).toBe(first); // the cache holds while the faces do

        settle();
        draw();
        expect(cache.entries.get("s0")).not.toBe(first);
    });

    // the state this phase exists to end: a surface that never reads the generation keeps the wrap
    // it solved against the fallback face for the rest of the session
    it("is what a surface without the dependency does not get", () => {
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const draw = (): void =>
            void paintSectionStack(host, sections, resolveProfile("deck"), tokens, {
                fullW: 1000,
                cache,
            });
        draw();
        const first = cache.entries.get("s0");
        settle();
        draw();
        expect(cache.entries.get("s0")).toBe(first);
    });

    it("drops the layers once per settle, not on every read", () => {
        const cache = createSectionStackCache();
        const fontsSettled = createFontsInvalidator(cache);
        paintSectionStack(document.createElement("div"), sections, resolveProfile("deck"), tokens, {
            fullW: 1000,
            cache,
        });

        fontsSettled();
        expect(cache.entries.size).toBe(1); // nothing has changed yet

        settle();
        fontsSettled();
        expect(cache.entries.size).toBe(0);

        paintSectionStack(document.createElement("div"), sections, resolveProfile("deck"), tokens, {
            fullW: 1000,
            cache,
        });
        fontsSettled();
        expect(cache.entries.size).toBe(1); // the same generation costs nothing
    });
});
