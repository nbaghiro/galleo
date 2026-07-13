import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { childrenRaw } from "@model/section";
import { bgImage, img, split, stat, t } from "@model/authoring";

const imgData = (e: ElementInstance): { src?: string; radius?: number; fit?: string } =>
    e.data as { src?: string; radius?: number; fit?: string };
const textOf = (e: ElementInstance | undefined): string | undefined =>
    (e?.data as { text?: string })?.text;
const widthPct = (e: ElementInstance): number | undefined => {
    const w = e.layout?.width;
    return w && typeof w === "object" ? w.pct : undefined;
};

describe("img", () => {
    it("passes an http src through unchanged", () => {
        expect(imgData(img("https://cdn.example.com/a.jpg", 1.5)).src).toBe(
            "https://cdn.example.com/a.jpg",
        );
    });
    it("builds a picsum URL from a seed, defaulting radius 14 + fit cover", () => {
        const e = img("mountain", 1.5);
        expect(imgData(e).src).toBe("https://picsum.photos/seed/mountain/1100/900");
        expect(imgData(e).radius).toBe(14);
        expect(imgData(e).fit).toBe("cover");
    });
});

describe("split", () => {
    it("weights the two columns 60 / 40", () => {
        const g = split(60, t("a", "body"), t("b", "body"));
        expect(childrenRaw(g)?.map(widthPct)).toEqual([60, 40]);
    });
});

describe("bgImage", () => {
    it("passes an http image through with the default scrim", () => {
        const bg = bgImage("https://cdn.example.com/bg.jpg");
        expect(bg.image).toBe("https://cdn.example.com/bg.jpg");
        expect(bg.scrim).toBe(0.5);
        expect(bg.kind).toBe("image");
    });
    it("builds a picsum URL from a seed", () => {
        expect(bgImage("hero").image).toBe("https://picsum.photos/seed/hero/1700/1100");
    });
});

describe("representative leaf builders", () => {
    it("t builds a styled text element", () => {
        expect(t("Hi", "h1")).toEqual({ type: "text", data: { text: "Hi", style: "h1" } });
    });
    it("stat nests a value + label pair", () => {
        const s = stat("92%", "uptime");
        expect(s.type).toBe("stat");
        expect(childrenRaw(s)?.map(textOf)).toEqual(["92%", "uptime"]);
    });
});
