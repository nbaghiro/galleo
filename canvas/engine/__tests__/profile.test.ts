import { describe, expect, it } from "vitest";
import {
    PROFILES,
    containedWidth,
    pagedSize,
    previewContentProfile,
    profileFor,
    rampScale,
    resolveProfile,
    sectionBleeds,
    sectionFrame,
    stacksAtWidth,
} from "@engine/profile";
import type { ArtifactContent, Section } from "@model/artifact";

const section = (aspect?: number): Section => ({
    id: "s",
    root: { type: "container", data: { children: [] } },
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
            overflow: "paginate",
        });
    });
    it("doc is a continuous 816-wide column, paginated on export", () => {
        expect(PROFILES.doc).toMatchObject({
            kind: "continuous",
            width: 816,
            height: "auto",
            maxContentWidth: 1000,
            overflow: "paginate",
        });
    });
    it("web is a full-bleed continuous format", () => {
        expect(PROFILES.web).toMatchObject({
            kind: "continuous",
            width: "fill",
            overflow: "paginate",
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
        expect(p.overflow).toBe(PROFILES.deck!.overflow);
        expect(p.splitMinWidth).toBe(PROFILES.deck!.splitMinWidth);
        expect(p.tokenScale).toBe(PROFILES.deck!.tokenScale);
    });
});

describe("sectionFrame", () => {
    const deck = resolveProfile("deck");

    it("deck default is 1280×720", () => {
        expect(sectionFrame(section(), deck)).toEqual({ w: 1280, h: 720 });
    });
    it("aspect 1 → square frame (h = w)", () => {
        expect(sectionFrame(section(1), deck).h).toBe(1280);
    });
    it("aspect 21/9 → shorter frame", () => {
        expect(sectionFrame(section(21 / 9), deck).h).toBe(549);
    });
    it("a non-positive aspect falls back to the profile height", () => {
        expect(sectionFrame(section(0), deck).h).toBe(720);
        expect(sectionFrame(section(-2), deck).h).toBe(720);
    });
    it("a continuous (auto-height) profile derives 16:9 from its width", () => {
        expect(sectionFrame(section(), resolveProfile("doc"))).toEqual({ w: 816, h: 459 });
    });

    it("takes the artifact's page size when the profile carries one", () => {
        const story = profileFor(content("deck", { width: 1080, height: 1920 }));
        expect(sectionFrame(section(), story)).toEqual({ w: 1080, h: 1920 });
    });

    it("a section aspect still overrides the height on a custom page", () => {
        const square = profileFor(content("deck", { width: 1080, height: 1080 }));
        expect(sectionFrame(section(2), square)).toEqual({ w: 1080, h: 540 });
    });
});

describe("containedWidth", () => {
    it("is the reading column, held off the board by the profile's inset", () => {
        expect(containedWidth(resolveProfile("doc"), 1440)).toBe(1000); // capped
        expect(containedWidth(resolveProfile("doc"), 800)).toBe(768); // inset-bound
        expect(containedWidth(resolveProfile("deck"), 800)).toBe(784); // a deck keeps a sliver
    });
});

describe("sectionBleeds", () => {
    const deck = resolveProfile("deck");
    const doc = resolveProfile("doc");
    const web = resolveProfile("web");
    const banded = (extra: Partial<Section>): Section => ({ ...section(), ...extra });
    const image = { kind: "image" as const, image: "p.png" };

    it("takes the flag as authored on a deck and on a site", () => {
        for (const profile of [deck, web]) {
            expect(sectionBleeds(banded({ bleed: true }), profile)).toBe(true);
            expect(
                sectionBleeds(
                    banded({ bleed: true, background: { kind: "tone", tone: "tint" } }),
                    profile,
                ),
            ).toBe(true);
            expect(sectionBleeds(banded({ background: image }), profile)).toBe(false);
        }
    });

    it("a doc keeps a tone band in the reading column, however it was flagged", () => {
        expect(
            sectionBleeds(banded({ bleed: true, background: { kind: "tone", tone: "tint" } }), doc),
        ).toBe(false);
        // and a bleed with nothing to paint is a wider column and nothing else
        expect(sectionBleeds(banded({ bleed: true }), doc)).toBe(false);
        expect(sectionBleeds(banded({ bleed: true, background: { kind: "none" } }), doc)).toBe(
            false,
        );
    });

    it("a doc bleeds a band that paints one, flagged or framed", () => {
        expect(sectionBleeds(banded({ bleed: true, background: image }), doc)).toBe(true);
        expect(
            sectionBleeds(
                banded({ bleed: true, background: { kind: "color", color: "#111" } }),
                doc,
            ),
        ).toBe(true);
        // a hero declares itself a band with its frame, which is how a site writes one
        expect(sectionBleeds({ ...section(2.3), background: image }, doc)).toBe(true);
        // …but a frame alone paints nothing
        expect(sectionBleeds(section(2.3), doc)).toBe(false);
    });

    it("a phone doc bleeds every section, since it has no gutter to hold", () => {
        const phone = previewContentProfile(doc, true);
        expect(sectionBleeds(banded({ bleed: true }), phone)).toBe(true);
    });
});

describe("previewContentProfile", () => {
    it("keeps every format at its editor width, so preview and editor agree line for line", () => {
        expect(previewContentProfile(PROFILES.deck!)).toBe(PROFILES.deck);
        expect(previewContentProfile(PROFILES.doc!)).toBe(PROFILES.doc);
        expect(previewContentProfile(PROFILES.web!)).toBe(PROFILES.web);
    });

    it("bleeds a doc edge-to-edge when asked, leaving desktop untouched", () => {
        expect(previewContentProfile(PROFILES.doc!, true).bleedSections).toBe(true);
        expect(previewContentProfile(PROFILES.doc!, false).bleedSections).toBeUndefined();
    });

    it("is a no-op for formats that already bleed or never do", () => {
        expect(previewContentProfile(PROFILES.web!, true)).toBe(PROFILES.web);
        expect(previewContentProfile(PROFILES.deck!, true)).toBe(PROFILES.deck);
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

describe("rampScale", () => {
    const web = PROFILES.web!;

    it("is exactly the base scale at and above the reference width", () => {
        expect(rampScale(web, web.ramp!.reference)).toBe(1);
        expect(rampScale(web, 1280)).toBe(1);
    });

    it("tracks the width linearly between the floor and the reference", () => {
        const ref = web.ramp!.reference;
        expect(rampScale(web, ref * 0.9)).toBeCloseTo(0.9);
        expect(rampScale(web, ref * 0.8)).toBeCloseTo(0.8);
    });

    it("floors at min so a phone keeps the type hierarchy", () => {
        expect(rampScale(web, 390)).toBe(web.ramp!.min);
        expect(rampScale(web, 1)).toBe(web.ramp!.min);
    });

    it("multiplies the profile's base tokenScale and skips profiles with no ramp", () => {
        const scaled = { ...web, tokenScale: 2 };
        expect(rampScale(scaled, 390)).toBeCloseTo(2 * web.ramp!.min);
        const flat = { ...web, ramp: undefined };
        expect(rampScale(flat, 390)).toBe(1);
    });

    it("every shipped format carries the shared ramp", () => {
        for (const p of [PROFILES.deck!, PROFILES.doc!, PROFILES.web!])
            expect(p.ramp).toEqual(PROFILES.web!.ramp);
    });
});
