import { describe, it, expect } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { applySectionOps } from "@model/artifact";
import { applyPatch } from "@model/ai";
import { isArtifactContent, isSectionOp } from "@services/core/artifacts";
import { resolveImages } from "@services/core/ai/images";
import { extractJson } from "@services/core/ai/schema";
import {
    zElement,
    zSection,
    zBeat,
    zBriefDraft,
    zOutline,
    zSectionPlan,
    zTokens,
    zTheme,
} from "@services/core/ai/schema";

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

    it("accepts `dock` on the layout — the site topbar's one structural field", () => {
        const ok = zElement.safeParse({
            type: "container",
            data: { direction: "row", children: [] },
            layout: { dock: "top" },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.layout?.dock).toBe("top");
    });

    it("drops a layout it cannot read rather than failing the whole element", () => {
        const ok = zElement.safeParse({
            type: "text",
            data: { text: "hi" },
            layout: { dock: "bottom" },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.layout).toBeUndefined();
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

    it("carries a grid child's span through the layout, and sheds a malformed one", () => {
        const ok = zSection.safeParse({
            id: "s3",
            root: {
                type: "container",
                data: { direction: "grid", columns: 2, children: [] },
            },
        });
        expect(ok.success).toBe(true);
        const spanned = zSection.safeParse({
            id: "s4",
            root: { type: "text", data: { text: "hero" }, layout: { span: 2 } },
        });
        expect(spanned.success && spanned.data.root.layout?.span).toBe(2);
        const bad = zSection.safeParse({
            id: "s5",
            root: { type: "text", data: { text: "x" }, layout: { span: "wide" } },
        });
        // .catch(undefined) sheds the malformed layout rather than failing the section
        expect(bad.success && bad.data.root.layout).toBeUndefined();
    });

    it("accepts a recursive root — a group whose data.children nest element trees", () => {
        const ok = zSection.safeParse({
            id: "s2",
            root: {
                type: "container",
                data: {
                    direction: "row",
                    children: [
                        {
                            type: "text",
                            data: { text: "Left", style: "h2" },
                            layout: { width: { pct: 60 } },
                        },
                        {
                            type: "container",
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

    it("keeps a theme-relative tone band, which is what the model should reach for first", () => {
        const ok = zSection.safeParse({
            id: "cta",
            root: { type: "text", data: { text: "hi" } },
            background: { kind: "tone", tone: "contrast" },
            bleed: true,
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.background).toEqual({ kind: "tone", tone: "contrast" });
    });

    it("drops a tone it does not know rather than failing the section", () => {
        const ok = zSection.safeParse({
            id: "cta",
            root: { type: "text", data: { text: "hi" } },
            background: { kind: "tone", tone: "loud" },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.background).toBeUndefined();
    });

    it("keeps `frame`, which is what makes a hero a band and a slide its own shape", () => {
        const ok = zSection.safeParse({
            id: "hero",
            root: { type: "text", data: { text: "hi" } },
            frame: { aspect: 2.29 },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.frame).toEqual({ aspect: 2.29 });
    });

    it("drops a frame it cannot read rather than failing the section", () => {
        const ok = zSection.safeParse({
            id: "hero",
            root: { type: "text", data: { text: "hi" } },
            frame: { aspect: "16/7" },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.frame).toBeUndefined();
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

// The site anatomy is only real if it survives the walk from the model's reply to the stored row.
// Nothing on that path may REBUILD a section: every step spreads, or guards without parsing.
describe("a hero rides from the model's reply to stored content intact", () => {
    const REPLY = JSON.stringify({
        id: "hero",
        root: {
            type: "container",
            data: {
                direction: "col",
                children: [
                    {
                        type: "container",
                        layout: { dock: "top" },
                        data: {
                            direction: "row",
                            children: [
                                {
                                    type: "text",
                                    data: { text: "Kestrel", style: "label" },
                                    layout: { width: "fill" },
                                },
                                {
                                    type: "button",
                                    data: { label: "Pricing", href: "#pricing" },
                                    layout: { width: "fit" },
                                },
                            ],
                        },
                    },
                    { type: "image", data: { src: "a dim operations room at night" } },
                ],
            },
        },
        background: { kind: "image", image: "a dim operations room at night", scrim: 0.55 },
        bleed: true,
        frame: { aspect: 2.29 },
    });

    const navOf = (s: Section): ElementInstance =>
        (s.root.data as { children: ElementInstance[] }).children[0]!;

    const parse = (): Section => {
        const parsed = zSection.safeParse(extractJson(REPLY));
        if (!parsed.success) throw new Error("the reply did not parse");
        return { ...parsed.data, id: "hero" }; // what writeSectionTool builds
    };

    it("survives the image walk, which rewrites srcs and touches nothing else", async () => {
        // an `ai` source with a generator never reaches the network
        const resolved = await resolveImages(parse(), {
            source: "ai",
            generate: async () => "https://cdn.test/room.jpg",
        });
        expect(resolved.frame).toEqual({ aspect: 2.29 });
        expect(navOf(resolved).layout?.dock).toBe("top");
        expect(resolved.background).toEqual({
            kind: "image",
            image: "https://cdn.test/room.jpg",
            scrim: 0.55,
        });
    });

    it("survives applyPatch, the op stream a generation is accumulated from", () => {
        const built = applyPatch({ format: "web", theme: "studio", sections: [] }, [
            { op: "addSection", afterId: null, section: parse() },
        ]);
        const hero = built.sections[0]!;
        expect(hero.frame).toEqual({ aspect: 2.29 });
        expect(navOf(hero).layout?.dock).toBe("top");
        expect(isArtifactContent(built)).toBe(true);
    });

    it("survives the section-op write path, which guards the op rather than rebuilding it", () => {
        const op = { kind: "insert" as const, index: 0, section: parse() };
        expect(isSectionOp(op)).toBe(true);
        const empty: ArtifactContent = { format: "web", theme: "studio", sections: [] };
        const next = applySectionOps(empty, [op]);
        expect(next.ok).toBe(true);
        const hero = next.ok ? next.content.sections[0]! : parse();
        expect(hero.frame).toEqual({ aspect: 2.29 });
        expect(navOf(hero).layout?.dock).toBe("top");
        expect((navOf(hero).data as { children: ElementInstance[] }).children[1]).toEqual({
            type: "button",
            data: { label: "Pricing", href: "#pricing" },
            layout: { width: "fit" },
        });
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

    it("accepts the story fields the outline now plans — takeaway + ordered points", () => {
        const ok = zBeat.safeParse({
            id: "s4",
            label: "The cost",
            role: "proof",
            takeaway: "Admin is the real expense.",
            points: ["11.3h/week lost", "$8,400 unpaid"],
        });
        expect(ok.success).toBe(true);
    });

    it("accepts optional `covers` tags (the must-cover checklist)", () => {
        const ok = zBeat.safeParse({
            id: "s3",
            label: "Team",
            role: "proof",
            covers: ["the team"],
        });
        expect(ok.success).toBe(true);
    });

    // a bare z.string() takes "", which let a model return an outline of empty beats, satisfy the
    // schema, and paint a blank board
    it.each(["id", "label", "role"])("rejects an empty `%s`", (field) => {
        const beat: Record<string, string> = { id: "s1", label: "Intro", role: "scene" };
        beat[field] = "";
        expect(zBeat.safeParse(beat).success).toBe(false);
    });
});

describe("zBriefDraft", () => {
    it("requires goal/audience/tone + 2–6 must-cover points; clarify optional", () => {
        const ok = zBriefDraft.safeParse({
            goal: "raise a seed round",
            audience: "early-stage investors",
            tone: "confident, plain",
            mustInclude: ["the team", "traction"],
        });
        expect(ok.success).toBe(true);
        const withQ = zBriefDraft.safeParse({
            goal: "g",
            audience: "a",
            tone: "t",
            mustInclude: ["x", "y"],
            clarify: "Live pitch or email attachment?",
        });
        expect(withQ.success).toBe(true);
    });
    it("tolerates a null clarify — models emit null for an optional field they skip", () => {
        const ok = zBriefDraft.safeParse({
            goal: "g",
            audience: "a",
            tone: "t",
            mustInclude: ["x", "y"],
            clarify: null,
        });
        expect(ok.success).toBe(true);
    });
    it("does not fail an otherwise-fine read over the point COUNT — that's normalized, not validated", () => {
        for (const mustInclude of [["only one"], Array.from({ length: 9 }, (_, i) => `p${i}`)])
            expect(
                zBriefDraft.safeParse({ goal: "g", audience: "a", tone: "t", mustInclude }).success,
            ).toBe(true);
    });
    // normalizeBrief turns a blank into undefined, so an all-blank read would have passed as a brief
    it.each(["goal", "audience", "tone"])("rejects an empty `%s`", (field) => {
        const read: Record<string, unknown> = {
            goal: "g",
            audience: "a",
            tone: "t",
            mustInclude: ["x", "y"],
        };
        read[field] = "";
        expect(zBriefDraft.safeParse(read).success).toBe(false);
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

describe("zTokens / zTheme", () => {
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
