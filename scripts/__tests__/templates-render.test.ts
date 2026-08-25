import { describe, expect, it } from "vitest";
import "@elements/register";
import type { EngineNode } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import { composeSection } from "@elements/compose";
import { ctxFor } from "@canvas/render/commands";
import { measure } from "@canvas/testkit";
import { layout } from "@engine/layout";
import { profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";
import { TEMPLATE_INDEX } from "@model/templates";
import { templateBody } from "@services/core/templates";

// The starter bodies are hand-authored data, so a typo in an element type or a composite's child
// order is not a type error: it paints a pink placeholder box, or a smart block silently loses a
// slot. Nothing else composes them — the seed writes them straight into a row — so this is where
// they go through the real engine. Lives under scripts/ because it is the one layer allowed to
// import canvas and services together (see the layering law in AGENTS.md).

const W = 1280;
const UNKNOWN_FILL = "#f6dede"; // composeElement's placeholder for an unregistered type
const EMPTY_LABEL = "+ drop element"; // emptyRegionNode's dashed drop target

interface Walked {
    format: string;
    unknown: number;
    empty: number;
    hits: string[];
    texts: string[];
    links: string[];
}

function walk(node: EngineNode, out: Walked): Walked {
    if (node.fill?.color === UNKNOWN_FILL) out.unknown += 1;
    if (node.text?.text === EMPTY_LABEL) out.empty += 1;
    if (node.text?.text) out.texts.push(node.text.text);
    if (node.id?.startsWith("hit:")) out.hits.push(node.id);
    if (node.link) out.links.push(node.link);
    for (const child of node.children ?? []) walk(child, out);
    return out;
}

const render = (content: ArtifactContent): Walked => {
    const theme = resolveTheme(content.theme).tokens;
    const profile = profileFor(content);
    const out: Walked = {
        format: content.format,
        unknown: 0,
        empty: 0,
        hits: [],
        texts: [],
        links: [],
    };
    for (const section of content.sections) {
        const node = composeSection(section, ctxFor(W, theme, profile, false, measure));
        walk(node, out);
        // laying out is the half that runs a composite's arrange against real text metrics
        const { commands } = layout(node, { x: 0, y: 0, w: W, h: 100000 }, measure);
        expect(commands.length, `${content.theme}/${section.id} painted nothing`).toBeGreaterThan(
            0,
        );
    }
    return out;
};

const RENDERED = new Map(TEMPLATE_INDEX.map((e) => [e.id, render(templateBody(e.id)!)]));

describe("every starter template composes through the engine", () => {
    it("names no element type the registry does not carry", () => {
        const bad = [...RENDERED].filter(([, r]) => r.unknown > 0).map(([id]) => id);
        expect(bad).toEqual([]);
    });

    // A deck leaves a deliberate empty region as a "your chart goes here" slot. A site is published
    // as it ships, so a dashed drop target there is a hole in the page.
    it("leaves no empty container in a site template", () => {
        const bad = [...RENDERED]
            .filter(([, r]) => r.format === "web" && r.empty > 0)
            .map(([id]) => id);
        expect(bad).toEqual([]);
    });

    it("is not vacuous — every body really does paint text", () => {
        for (const [id, r] of RENDERED) expect(r.texts.length, id).toBeGreaterThan(20);
    });
});

// A collapsible FAQ and a tab strip are only interactive because compose stamps a `hit:` region on
// the row a reader presses. Authoring one without the variant set renders a static list instead,
// which looks identical in a screenshot.
describe("the reader affordances the site templates ship", () => {
    const hitsOf = (id: string, action: string): string[] =>
        (RENDERED.get(id)?.hits ?? []).filter((h) => h.startsWith(`hit:${action}:`));

    it("gives every faq that asked to collapse a pressable question row", () => {
        for (const id of [
            "event-invite",
            "product-launch",
            "landing-page",
            "event-page",
            "waitlist-page",
        ])
            expect(hitsOf(id, "disclose").length, id).toBeGreaterThan(3);
    });

    it("gives the landing page's tabs a switchable strip", () => {
        expect(hitsOf("landing-page", "tab")).toHaveLength(3);
    });
});
