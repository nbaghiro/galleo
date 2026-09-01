import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { childrenRaw } from "@model/artifact";
import {
    bgImage,
    bgTone,
    clampLines,
    img,
    pin,
    polaroid,
    split,
    stat,
    t,
    table,
} from "@model/authoring";

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

describe("bgTone", () => {
    it("names the band against the theme rather than fixing a colour", () => {
        expect(bgTone("tint")).toEqual({ kind: "tone", tone: "tint" });
        expect(bgTone("contrast")).toEqual({ kind: "tone", tone: "contrast" });
        expect(bgTone("accent")).toEqual({ kind: "tone", tone: "accent" });
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

describe("pinning helpers", () => {
    it("pin lifts an element with fit width and merges anchors over existing layout", () => {
        const el = pin(t("Badge", "label"), "end", "start", { dx: -16, dy: 16, rotate: -4 });
        expect(el.layout).toEqual({
            width: "fit",
            pin: { x: "end", y: "start", dx: -16, dy: 16, rotate: -4 },
        });
        const kept = pin({ ...t("x", "body"), layout: { width: { pct: 30 } } }, "end", "center");
        expect(kept.layout?.width).toEqual({ pct: 30 });
    });

    it("polaroid is a solid card holding the photo and its caption", () => {
        const p = polaroid("https://x/y.jpg", 1.2, "an hour before");
        const d = p.data as { surface?: string; children?: { type: string }[] };
        expect(d.surface).toBe("solid");
        expect(d.children?.map((c) => c.type)).toEqual(["media", "text"]);
    });

    it("clampLines writes maxLines; table threads clamp only when given", () => {
        expect((clampLines(t("x", "body"), 3).data as { maxLines?: number }).maxLines).toBe(3);
        expect((table("a,b\n1,2", true, 1).data as { clamp?: number }).clamp).toBe(1);
        expect("clamp" in (table("a,b\n1,2").data as Record<string, unknown>)).toBe(false);
    });
});
