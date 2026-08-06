import { describe, it, expect } from "vitest";
import { PERSONA, surfaceVoice } from "../persona";

describe("PERSONA", () => {
    it("states the content-designer identity", () => {
        expect(PERSONA).toContain("Galleo's content designer");
    });
});

describe("surfaceVoice", () => {
    it("gives deck a slide-oriented blurb", () => {
        expect(surfaceVoice("deck")).toContain("DECK");
    });
    it("gives doc a document-oriented blurb", () => {
        expect(surfaceVoice("doc")).toContain("DOCUMENT");
    });
    it("gives web a landing-page blurb", () => {
        expect(surfaceVoice("web")).toContain("WEBSITE");
    });
    it("returns a distinct blurb for each surface", () => {
        const deck = surfaceVoice("deck");
        const doc = surfaceVoice("doc");
        const web = surfaceVoice("web");
        expect(new Set([deck, doc, web]).size).toBe(3);
    });
});
