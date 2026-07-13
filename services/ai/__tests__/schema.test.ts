import { describe, it, expect } from "vitest";
import {
    zElement,
    zSection,
    zBeat,
    zOutline,
    zSectionPlan,
    zRewrite,
    zTokens,
    zTheme,
} from "../schema";

describe("zElement", () => {
    it("accepts a { type, data } instance; data is an OPEN record (extra keys tolerated)", () => {
        const ok = zElement.safeParse({
            type: "text",
            data: { text: "Hello", style: "h1", whatever: 42, nested: { a: 1 } },
        });
        expect(ok.success).toBe(true);
    });

    it("accepts an optional layout record", () => {
        const ok = zElement.safeParse({
            type: "image",
            data: { src: "x" },
            layout: { width: { pct: 60 } },
        });
        expect(ok.success).toBe(true);
    });

    it("rejects a malformed element missing `type`", () => {
        const bad = zElement.safeParse({ data: { text: "orphan" } });
        expect(bad.success).toBe(false);
    });

    it("rejects an element whose `data` is not an object", () => {
        const bad = zElement.safeParse({ type: "text", data: "not-a-record" });
        expect(bad.success).toBe(false);
    });
});

describe("zSection", () => {
    it("requires `id` + `root`; `background`/`bleed` are optional", () => {
        const minimal = zSection.safeParse({
            id: "s1",
            root: { type: "text", data: { text: "hi" } },
        });
        expect(minimal.success).toBe(true);
    });

    it("accepts a recursive root — a group whose data.children nest element trees", () => {
        const ok = zSection.safeParse({
            id: "s2",
            root: {
                type: "group",
                data: {
                    direction: "row",
                    children: [
                        {
                            type: "text",
                            data: { text: "Left", style: "h2" },
                            layout: { width: { pct: 60 } },
                        },
                        {
                            type: "group",
                            data: {
                                children: [
                                    { type: "stat", data: { children: [] } },
                                    { type: "image", data: { src: "hero" } },
                                ],
                            },
                        },
                    ],
                },
            },
            background: { kind: "color", color: "#101010" },
            bleed: true,
        });
        expect(ok.success).toBe(true);
    });

    it("rejects a section missing `id`", () => {
        const bad = zSection.safeParse({ root: { type: "text", data: {} } });
        expect(bad.success).toBe(false);
    });

    it("rejects a section missing `root`", () => {
        const bad = zSection.safeParse({ id: "s1" });
        expect(bad.success).toBe(false);
    });

    it("rejects a section whose `root` is a malformed element (missing type)", () => {
        const bad = zSection.safeParse({ id: "s1", root: { data: { text: "no type" } } });
        expect(bad.success).toBe(false);
    });
});

describe("zBeat", () => {
    it("requires id + label + role; layout/image/blocks/brief optional", () => {
        const minimal = zBeat.safeParse({ id: "s1", label: "Intro", role: "scene" });
        expect(minimal.success).toBe(true);
        const full = zBeat.safeParse({
            id: "s2",
            label: "The turn",
            role: "turn",
            layout: "split-6040",
            image: true,
            blocks: ["text", "image"],
            brief: "say the thing",
        });
        expect(full.success).toBe(true);
    });

    it("rejects a beat missing its required `id`", () => {
        const bad = zBeat.safeParse({ label: "Intro", role: "scene" });
        expect(bad.success).toBe(false);
    });
});

describe("zOutline", () => {
    it("accepts a title + backdrop + at least one beat", () => {
        const ok = zOutline.safeParse({
            title: "Pitch",
            backdrop: "a modern office at dusk",
            beats: [{ id: "s1", label: "Intro", role: "scene" }],
        });
        expect(ok.success).toBe(true);
    });

    it("rejects an empty `beats` array (.min(1))", () => {
        const bad = zOutline.safeParse({ title: "Pitch", backdrop: "x", beats: [] });
        expect(bad.success).toBe(false);
    });
});

describe("zSectionPlan (zBeat.omit({ id }))", () => {
    it("accepts a plan WITHOUT an id", () => {
        const ok = zSectionPlan.safeParse({
            label: "New section",
            role: "proof",
            brief: "prove it",
        });
        expect(ok.success).toBe(true);
    });

    it("omits `id`: a carried id is stripped from the parsed output, never surfacing", () => {
        const r = zSectionPlan.safeParse({ id: "s9", label: "New section", role: "proof" });
        expect(r.success).toBe(true);
        expect(r.success && "id" in r.data).toBe(false);
    });
});

describe("zRewrite / zTokens / zTheme", () => {
    it("zRewrite requires a `text` string", () => {
        expect(zRewrite.safeParse({ text: "done" }).success).toBe(true);
        expect(zRewrite.safeParse({}).success).toBe(false);
    });

    it("zTokens validates the required color/font/number token set", () => {
        const tokens = {
            bg: "#0d0e13",
            surface: "#18191e",
            ink: "#e4e8f2",
            soft: "#a2a5ae",
            muted: "#72757d",
            accent: "#bf9846",
            onAccent: "#161107",
            line: "#34363c",
            radius: 4,
            fontDisplay: "Cinzel",
            fontBody: "Jost",
            fontMono: "Geist Mono",
            headingWeight: 500,
        };
        expect(zTokens.safeParse(tokens).success).toBe(true);
        expect(
            zTokens.safeParse({ ...tokens, border: 1, shadow: "none", scrim: 0.4 }).success,
        ).toBe(true);
        const { ink: _drop, ...missing } = tokens;
        expect(zTokens.safeParse(missing).success).toBe(false);
    });

    it("zTheme wraps name/mood/isDark + tokens", () => {
        const bad = zTheme.safeParse({ name: "Royal", mood: "luxe", isDark: true });
        expect(bad.success).toBe(false);
    });
});
