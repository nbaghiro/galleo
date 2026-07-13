import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { colGroup, rowGroup } from "@model/section";
import { SECTION_LAYOUTS, sectionBlocks } from "@elements/layouts";
import { inst, sectionOf } from "@canvas/testkit";

const img = (src = "photo.png"): ElementInstance => inst("image", { src });
const txt = (t = "copy"): ElementInstance => inst("text", { text: t });
const preset = (id: string): (typeof SECTION_LAYOUTS)[number] =>
    SECTION_LAYOUTS.find((l) => l.id === id)!;

describe("sectionBlocks", () => {
    it("flattens group scaffolding and tags media vs content roles in document order", () => {
        const blocks = sectionBlocks(sectionOf(rowGroup([colGroup([txt()]), img()])));
        expect(blocks.map((b) => b.role)).toEqual(["content", "media"]);
    });
});

describe("split presets", () => {
    it("matches the section's current column fractions", () => {
        const s = sectionOf(rowGroup([txt(), txt()], [0.6, 0.4]));
        expect(preset("split-6040").matches(s)).toBe(true);
        expect(preset("two-col").matches(s)).toBe(false);
    });
    it("transform then matches round-trips", () => {
        const s = preset("split-6040").transform(sectionOf(txt()));
        expect(preset("split-6040").matches(s)).toBe(true);
    });
});

describe("media presets", () => {
    const mixed = (): ReturnType<typeof sectionOf> => sectionOf(colGroup([txt(), img()]));

    it("applies only when the section has both media and content", () => {
        expect(preset("media-right").applies(mixed())).toBe(true);
        expect(preset("media-right").applies(sectionOf(txt()))).toBe(false);
    });
    it("media-right transform then matches round-trips", () => {
        const s = preset("media-right").transform(mixed());
        expect(preset("media-right").matches(s)).toBe(true);
    });
    it("media-left transform then matches round-trips", () => {
        const s = preset("media-left").transform(mixed());
        expect(preset("media-left").matches(s)).toBe(true);
    });
    it("media-top transform then matches round-trips", () => {
        const s = preset("media-top").transform(mixed());
        expect(preset("media-top").matches(s)).toBe(true);
    });
    it("media-bleed moves the image into the section background", () => {
        const s = preset("media-bleed").transform(mixed());
        expect(s.bleed).toBe(true);
        expect(s.background?.kind).toBe("image");
        expect(s.background?.image).toBe("photo.png");
        expect(s.background?.scrim).toBe(0.4);
    });
});
