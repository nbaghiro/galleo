import { describe, expect, it } from "vitest";
import "@elements/register";
import type { ElementInstance, Section } from "@model/artifact";
import type { RenderCommand } from "@engine/node";
import { layoutSection } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { measure } from "@canvas/testkit";
import { THEMES } from "@themes";
import { extractJson, zSection } from "@services/core/ai/schema";

// The two ends of the site round meeting: what the model is now allowed to write (zSection) and what
// the engine does with it. A field the schema drops shows up here as a section that lays out flat,
// and an element the model can name but the registry cannot resolve shows up as the pink box.

const W = 1280;
const ASPECT = 2.29;
const UNKNOWN_ELEMENT_FILL = "#f6dede";

// written the way the section writer replies: one JSON object, fences and all
const MODEL_REPLY = `\`\`\`json
{
  "id": "hero",
  "root": { "type": "container", "data": { "direction": "col", "children": [
    { "type": "container", "layout": { "dock": "top" }, "data": { "direction": "row", "align": "center", "children": [
      { "type": "text", "data": { "text": "Kestrel", "style": "label" }, "layout": { "width": "fill" } },
      { "type": "popup", "layout": { "width": "fit" }, "data": { "label": "Product", "variant": "menu", "children": [
        { "type": "button", "data": { "label": "How it works", "href": "#how", "variant": "ghost", "size": "sm" } },
        { "type": "button", "data": { "label": "Changelog", "href": "https://kestrel.dev/changelog", "variant": "ghost", "size": "sm" } }
      ] } },
      { "type": "button", "layout": { "width": "fit" }, "data": { "label": "Pricing", "href": "#pricing", "variant": "ghost", "size": "sm" } },
      { "type": "button", "layout": { "width": "fit" }, "data": { "label": "Start free", "href": "#signup", "variant": "filled", "size": "sm", "shape": "pill" } }
    ] } },
    { "type": "text", "data": { "text": "KESTREL", "style": "label" } },
    { "type": "text", "data": { "text": "Every incident, on one timeline.", "style": "h1" } },
    { "type": "button", "data": { "label": "See how it works", "href": "#how", "size": "lg" } }
  ] } },
  "background": { "kind": "image", "image": "a dim operations room at night", "scrim": 0.55 },
  "bleed": true,
  "frame": { "aspect": ${ASPECT} }
}
\`\`\``;

function parseReply(): Section {
    const parsed = zSection.safeParse(extractJson(MODEL_REPLY));
    if (!parsed.success) throw new Error(`the reply did not parse: ${parsed.error.message}`);
    // exactly what writeSectionTool does with it
    return { ...parsed.data, id: "hero" };
}

const kids = (el: ElementInstance): ElementInstance[] =>
    ((el.data as { children?: ElementInstance[] }).children ?? []).slice();

const undock = (s: Section): Section => {
    const [nav, ...rest] = kids(s.root);
    const bare: ElementInstance = { type: nav!.type, data: nav!.data };
    return {
        ...s,
        root: { ...s.root, data: { ...(s.root.data as object), children: [bare, ...rest] } },
    };
};

const web = resolveProfile("web");
const theme = THEMES.studio!.tokens;

const draw = (s: Section): { commands: RenderCommand[]; height: number } => {
    const { commands, height } = layoutSection(s, W, measure, theme, web);
    return { commands, height };
};

const textY = (commands: RenderCommand[], text: string): number => {
    const hit = commands.find((c) => c.kind === "text" && c.text.text === text);
    if (!hit) throw new Error(`no text command for "${text}"`);
    return hit.box.y;
};

describe("a schema round-tripped site section", () => {
    const section = parseReply();

    it("keeps the band frame the model wrote", () => {
        expect(section.frame).toEqual({ aspect: ASPECT });
    });

    it("keeps the dock on the nav row and the widths on its children", () => {
        const nav = kids(section.root)[0]!;
        expect(nav.layout?.dock).toBe("top");
        expect(kids(nav)[0]!.layout?.width).toBe("fill");
        expect(kids(nav)[1]!.layout?.width).toBe("fit");
    });

    it("keeps the popup menu whole, children and all (data is an open record)", () => {
        const popup = kids(kids(section.root)[0]!)[1]!;
        expect(popup.type).toBe("popup");
        expect((popup.data as { variant?: string }).variant).toBe("menu");
        expect(kids(popup).map((k) => (k.data as { href?: string }).href)).toEqual([
            "#how",
            "https://kestrel.dev/changelog",
        ]);
    });

    it("keeps the background and the bleed flag", () => {
        expect(section.background).toEqual({
            kind: "image",
            image: "a dim operations room at night",
            scrim: 0.55,
        });
        expect(section.bleed).toBe(true);
    });
});

describe("the same section through compose and layout", () => {
    const section = parseReply();
    const { commands, height } = draw(section);

    it("paints no unknown-element box: every type it names is registered", () => {
        const pink = commands.filter(
            (c) => c.kind === "rect" && c.fill?.color === UNKNOWN_ELEMENT_FILL,
        );
        expect(pink).toEqual([]);
    });

    it("paints no empty drop region: every container the model wrote has content", () => {
        expect(commands.some((c) => c.kind === "text" && c.text.text === "+ drop element")).toBe(
            false,
        );
    });

    it("opens as a band at least as tall as width ÷ aspect", () => {
        expect(height).toBeGreaterThanOrEqual(Math.floor(W / ASPECT));
    });

    it("carries every #section-id href through to a link command", () => {
        const links = new Set(commands.map((c) => c.link).filter(Boolean));
        expect(links.has("#pricing")).toBe(true);
        expect(links.has("#signup")).toBe(true);
        expect(links.has("#how")).toBe(true);
    });

    it("paints the popup as its closed trigger, not as the panel in flow", () => {
        expect(commands.some((c) => c.kind === "text" && c.text.text === "Product")).toBe(true);
        expect(commands.some((c) => c.kind === "text" && c.text.text === "Changelog")).toBe(false);
    });

    // the dock is the whole point: without it the brand sits in the flow, one gap above the
    // headline; with it the row is lifted to the band's top edge and the copy centres below
    it("lifts the docked row clear of the centred hero copy", () => {
        const docked =
            textY(commands, "Kestrel") - textY(commands, "Every incident, on one timeline.");
        const flowed = (() => {
            const out = draw(undock(section)).commands;
            return textY(out, "Kestrel") - textY(out, "Every incident, on one timeline.");
        })();
        expect(docked).toBeLessThan(flowed);
        expect(flowed - docked).toBeGreaterThan(80);
    });
});
