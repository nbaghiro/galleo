import { describe, expect, it } from "vitest";
import "@elements/register";
import type { RenderCommand } from "@engine/node";
import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { composeSection } from "@elements/compose";
import { ctxFor } from "@canvas/render/commands";
import { layout } from "@engine/layout";
import { profileFor } from "@engine/profile";
import { measure, readingOrder } from "@canvas/testkit";
import { THEMES } from "@themes";
import { galleo } from "@services/core/ai/corpus/galleo";
import { aria } from "@services/core/ai/corpus/aria";
import { helios } from "@services/core/ai/corpus/helios";
import { lumen } from "@services/core/ai/corpus/lumen";
import { terra } from "@services/core/ai/corpus/terra";
import { slowweb } from "@services/core/ai/corpus/slowweb";
import { fieldnotes } from "@services/core/ai/corpus/fieldnotes";

const W = 1280;
const CORPUS = { galleo, aria, helios, lumen, terra, slowweb, fieldnotes };

const draw = (
    section: Section,
    theme: Tokens,
    profile: FormatDescriptor,
): { tree: string[]; emitted: string[]; commands: RenderCommand[] } => {
    const node = composeSection(section, ctxFor(W, theme, profile, false, measure));
    const { commands } = layout(node, { x: 0, y: 0, w: W, h: 100000 }, measure);
    return { ...readingOrder(node, commands), commands };
};

const everySection = (run: (name: string, out: ReturnType<typeof draw>) => void): void => {
    for (const [name, content] of Object.entries(CORPUS)) {
        const theme = THEMES[content.theme]?.tokens ?? THEMES.studio!.tokens;
        const profile = profileFor(content);
        for (const section of content.sections)
            run(`${name}/${section.id}`, draw(section, theme, profile));
    }
};

// What a screen reader and a text-only browser walk is the command stream, so nothing may reorder
// the flow: pinned here rather than in a review comment, because the failure is silent.
describe("reading order over the corpus", () => {
    it("emits flow text in tree order, section by section", () => {
        everySection((where, out) => expect(out.emitted, where).toEqual(out.tree));
    });

    it("is not vacuous — the corpus really does carry text", () => {
        let total = 0;
        everySection((_, out) => {
            total += out.tree.length;
        });
        expect(total).toBeGreaterThan(200);
    });
});

describe("decoration over the corpus", () => {
    it("marks the negative-z floats the diagrams paint behind their cells", () => {
        let decor = 0;
        everySection((_, out) => {
            decor += out.commands.filter((c) => c.decor).length;
        });
        expect(decor).toBeGreaterThan(0);
    });

    it("never marks anything in the reading order", () => {
        everySection((where, out) => {
            const spoken = new Set(out.emitted);
            for (const c of out.commands)
                if (c.decor && c.kind === "text")
                    expect(spoken.has(c.text.text), where).toBe(false);
        });
    });
});
