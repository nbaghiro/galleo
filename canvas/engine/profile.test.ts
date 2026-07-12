import { describe, expect, it } from "vitest";
import { PROFILES, previewContentProfile, resolveProfile, slideFrame } from "@engine/profile";
import type { Section } from "@model/artifact";

const section = (aspect?: number): Section => ({
    id: "s",
    root: { type: "group", data: { children: [] } },
    ...(aspect !== undefined ? { frame: { aspect } } : {}),
});

describe("resolveProfile", () => {
    it("returns the named profile", () => {
        expect(resolveProfile("deck").id).toBe("deck");
        expect(resolveProfile("doc").id).toBe("doc");
        expect(resolveProfile("web").id).toBe("web");
    });
    it("falls back to deck for an unknown or missing id", () => {
        expect(resolveProfile("nope").id).toBe("deck");
        expect(resolveProfile(undefined).id).toBe("deck");
    });
});

describe("PROFILES — pinned page geometry", () => {
    it("deck is a 1280×720 paged frame", () => {
        expect(PROFILES.deck).toMatchObject({
            kind: "paged",
            width: 1280,
            height: 720,
            maxContentWidth: 1120,
            splitMinWidth: 520,
            paginate: "always",
        });
    });
    it("doc is a continuous 816-wide column, paginated on export", () => {
        expect(PROFILES.doc).toMatchObject({
            kind: "continuous",
            width: 816,
            height: "auto",
            maxContentWidth: 1000,
            paginate: "export",
        });
    });
    it("web is a full-bleed continuous format", () => {
        expect(PROFILES.web).toMatchObject({
            kind: "continuous",
            width: "fill",
            paginate: "never",
        });
    });
});

// slideFrame: the paged frame a section renders into — the profile page size, overridden by the section's
// own aspect (h = round(w / aspect)).
describe("slideFrame", () => {
    const deck = resolveProfile("deck");

    it("deck default is 1280×720", () => {
        expect(slideFrame(section(), deck)).toEqual({ w: 1280, h: 720 });
    });
    it("aspect 1 → square frame (h = w)", () => {
        expect(slideFrame(section(1), deck).h).toBe(1280);
    });
    it("aspect 21/9 → shorter frame", () => {
        expect(slideFrame(section(21 / 9), deck).h).toBe(549);
    });
    it("a non-positive aspect falls back to the profile height", () => {
        expect(slideFrame(section(0), deck).h).toBe(720);
        expect(slideFrame(section(-2), deck).h).toBe(720);
    });
    it("a continuous (auto-height) profile derives 16:9 from its width", () => {
        expect(slideFrame(section(), resolveProfile("doc"))).toEqual({ w: 816, h: 459 });
    });
});

// previewContentProfile: lets a document widen with the viewport, floored at the editor width, capped for
// readability. Deck + web pass through untouched.
describe("previewContentProfile", () => {
    it("returns paged (deck) and web formats untouched", () => {
        expect(previewContentProfile(PROFILES.deck!, 2000)).toBe(PROFILES.deck);
        expect(previewContentProfile(PROFILES.web!, 2000)).toBe(PROFILES.web);
    });
    it("keeps the doc at its editor width when the viewport is narrow", () => {
        expect(previewContentProfile(PROFILES.doc!, 800)).toBe(PROFILES.doc); // floored at editorMax
    });
    it("grows the doc with the viewport", () => {
        expect(previewContentProfile(PROFILES.doc!, 1500).maxContentWidth).toBe(1170); // round(1500·0.78)
    });
    it("caps the doc width at the readability ceiling", () => {
        expect(previewContentProfile(PROFILES.doc!, 3000).maxContentWidth).toBe(1440);
    });
});
