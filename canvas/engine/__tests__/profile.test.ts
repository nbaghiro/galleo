import { describe, expect, it } from "vitest";
import {
    PROFILES,
    pagedSize,
    previewContentProfile,
    profileFor,
    resolveProfile,
    slideFrame,
    stacksAtWidth,
} from "@engine/profile";
import type { ArtifactContent, Section } from "@model/artifact";

const section = (aspect?: number): Section => ({
    id: "s",
    root: { type: "group", data: { children: [] } },
    ...(aspect !== undefined ? { frame: { aspect } } : {}),
});

const content = (format: string, page?: { width: number; height: number }): ArtifactContent => ({
    format,
    theme: "studio",
    sections: [],
    ...(page ? { page } : {}),
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

describe("pagedSize", () => {
    it("reads a paged profile's own dimensions", () => {
        expect(pagedSize(PROFILES.deck!)).toEqual({ w: 1280, h: 720 });
    });
    it("derives 16:9 from the width when the height is auto", () => {
        expect(pagedSize(PROFILES.doc!)).toEqual({ w: 816, h: 459 });
    });
    it("falls back to the deck box when the width is viewport-driven", () => {
        expect(pagedSize(PROFILES.web!)).toEqual({ w: 1280, h: 720 });
    });
});

describe("profileFor", () => {
    // the conversion's regression guarantee: every switched call site gets the same object as before
    it("is identical to resolveProfile for every format when no page is set", () => {
        for (const id of Object.keys(PROFILES))
            expect(profileFor(content(id))).toBe(resolveProfile(id));
    });

    it("ignores a page on a continuous format", () => {
        expect(profileFor(content("doc", { width: 1080, height: 1350 }))).toBe(PROFILES.doc);
        expect(profileFor(content("web", { width: 1080, height: 1350 }))).toBe(PROFILES.web);
    });

    it("overlays the page size on a paged format", () => {
        const p = profileFor(content("deck", { width: 1080, height: 1350 }));
        expect(p).toMatchObject({ id: "deck", kind: "paged", width: 1080, height: 1350 });
    });

    it("caps maxContentWidth at the page width so content cannot exceed the page", () => {
        expect(profileFor(content("deck", { width: 600, height: 600 })).maxContentWidth).toBe(600);
        // a page wider than the format's cap keeps the cap (readability, not page size, decides it)
        expect(profileFor(content("deck", { width: 2000, height: 2000 })).maxContentWidth).toBe(
            1120,
        );
    });

    it("rejects a non-positive page rather than producing a zero-sized frame", () => {
        expect(profileFor(content("deck", { width: 0, height: 500 }))).toBe(PROFILES.deck);
        expect(profileFor(content("deck", { width: 500, height: -1 }))).toBe(PROFILES.deck);
    });

    it("leaves every other profile field alone", () => {
        const p = profileFor(content("deck", { width: 1080, height: 1080 }));
        expect(p.paginate).toBe(PROFILES.deck!.paginate);
        expect(p.splitMinWidth).toBe(PROFILES.deck!.splitMinWidth);
        expect(p.tokenScale).toBe(PROFILES.deck!.tokenScale);
    });
});

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

    it("takes the artifact's page size when the profile carries one", () => {
        const story = profileFor(content("deck", { width: 1080, height: 1920 }));
        expect(slideFrame(section(), story)).toEqual({ w: 1080, h: 1920 });
    });

    it("a section aspect still overrides the height on a custom page", () => {
        const square = profileFor(content("deck", { width: 1080, height: 1080 }));
        expect(slideFrame(section(2), square)).toEqual({ w: 1080, h: 540 });
    });
});

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

    it("bleeds a doc edge-to-edge when asked, leaving desktop untouched", () => {
        expect(previewContentProfile(PROFILES.doc!, 430, true).bleedSections).toBe(true);
        expect(previewContentProfile(PROFILES.doc!, 1500, false).bleedSections).toBeUndefined();
    });

    it("is a no-op for formats that already bleed or never do", () => {
        expect(previewContentProfile(PROFILES.web!, 430, true)).toBe(PROFILES.web);
        expect(previewContentProfile(PROFILES.deck!, 430, true)).toBe(PROFILES.deck);
    });
});

describe("stacksAtWidth", () => {
    it("switches exactly at each format's threshold", () => {
        for (const p of [PROFILES.deck!, PROFILES.doc!, PROFILES.web!]) {
            expect(stacksAtWidth(p, p.splitMinWidth - 1)).toBe(true);
            expect(stacksAtWidth(p, p.splitMinWidth)).toBe(false);
        }
    });

    it("orders the thresholds web > doc > deck", () => {
        // web bleeds full width so it needs the most room; a deck page is narrowest and splits soonest
        expect(PROFILES.web!.splitMinWidth).toBeGreaterThan(PROFILES.doc!.splitMinWidth);
        expect(PROFILES.doc!.splitMinWidth).toBeGreaterThan(PROFILES.deck!.splitMinWidth);
    });

    it("stacks every format at phone content widths and none at desktop", () => {
        for (const p of [PROFILES.deck!, PROFILES.doc!, PROFILES.web!]) {
            expect(stacksAtWidth(p, 226)).toBe(true);
            expect(stacksAtWidth(p, 1180)).toBe(false);
        }
    });
});
