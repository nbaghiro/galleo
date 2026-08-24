// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import { createSectionStackCache, paint, paintSectionStack } from "@canvas/render/backends";
import { layoutSection } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { getElement } from "@elements/spec";
import { toRuns } from "@model/text";
import { inst, installCanvas2D, layoutCtx, measure, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());
const deck = resolveProfile("deck");

const paintOne = (c: RenderCommand): HTMLElement => {
    const host = document.createElement("div");
    paint([c], host);
    return host.children[0] as HTMLElement;
};

describe("link semantics on the render command", () => {
    it("the button element puts its href on the node, and the engine hands it to every command it covers", () => {
        const node = getElement("button")!.layout(
            { label: "Get started", href: "https://galleo.app" },
            layoutCtx(),
        );
        expect(node.link).toBe("https://galleo.app");
        const { commands } = layoutSection(
            sectionOf(inst("button", { label: "Get started", href: "https://galleo.app" })),
            800,
            measure,
            tokens,
            deck,
        );
        const linked = commands.filter((c) => c.link === "https://galleo.app");
        expect(linked.some((c) => c.kind === "rect")).toBe(true);
        expect(linked.some((c) => c.kind === "text")).toBe(true);
    });

    it("an empty href stays inert rather than painting an anchor to nowhere", () => {
        expect(getElement("button")!.layout({ label: "Go", href: "   " }, layoutCtx()).link).toBe(
            undefined,
        );
    });

    it("paints a linked command as an anchor that opens in a new tab", () => {
        const el = paintOne({
            kind: "text",
            box: { x: 0, y: 0, w: 80, h: 20 },
            text: { text: "Get started", fontId: "f", size: 12, wrap: "none" },
            link: "https://galleo.app",
        });
        expect(el.tagName).toBe("A");
        expect(el.getAttribute("href")).toBe("https://galleo.app");
        expect(el.getAttribute("target")).toBe("_blank");
        expect(el.getAttribute("rel")).toBe("noopener noreferrer");
        expect(el.style.textDecoration).toBe("none");
    });

    it("exposes only the anchor that has a name; the linked box beside it is decoration", () => {
        const text = paintOne({
            kind: "text",
            box: { x: 0, y: 0, w: 80, h: 20 },
            text: { text: "Get started", fontId: "f", size: 12, wrap: "none" },
            link: "https://galleo.app",
        });
        expect(text.getAttribute("aria-hidden")).toBeNull();
        const box = paintOne({
            kind: "rect",
            box: { x: 0, y: 0, w: 80, h: 20 },
            fill: { color: "#000" },
            link: "https://galleo.app",
        });
        expect(box.getAttribute("aria-hidden")).toBe("true");
        expect(box.getAttribute("tabindex")).toBe("-1");
    });

    it("paints a linked run as an anchor inside the text, underlined in the surrounding ink", () => {
        const el = paintOne({
            kind: "text",
            box: { x: 0, y: 0, w: 200, h: 20 },
            text: {
                text: "read the docs",
                fontId: "f",
                size: 12,
                wrap: "words",
                runs: toRuns("read the docs", [
                    { from: 5, to: 13, type: "link", value: "https://galleo.app/docs" },
                ]),
            },
        });
        const anchors = [...el.querySelectorAll("a")];
        expect(anchors).toHaveLength(1);
        expect(anchors[0]!.getAttribute("href")).toBe("https://galleo.app/docs");
        expect(anchors[0]!.getAttribute("rel")).toBe("noopener noreferrer");
        expect(anchors[0]!.style.textDecorationLine).toContain("underline");
        expect(el.textContent).toBe("read the docs");
    });

    it("reconciles across the div/anchor tag change in both directions", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const draw = (href: string | undefined): HTMLElement | null => {
            paintSectionStack(
                host,
                [sectionOf(inst("button", { label: "Go", href }), { id: "s1" })],
                deck,
                tokens,
                { fullW: 800, cache },
            );
            return host.querySelector("a");
        };
        expect(draw(undefined)).toBeNull();
        expect(draw("https://galleo.app")?.getAttribute("href")).toBe("https://galleo.app");
        expect(draw(undefined)).toBeNull();
    });
});

describe("heading + alt semantics", () => {
    it("the text element carries the heading rank of h1/h2/h3 and nothing else", () => {
        const level = (style: string): number | undefined =>
            getElement("text")!.layout({ text: "T", style }, layoutCtx()).text?.level;
        expect(level("h1")).toBe(1);
        expect(level("h2")).toBe(2);
        expect(level("h3")).toBe(3);
        expect(level("body")).toBeUndefined();
        expect(level("subtitle")).toBeUndefined();
    });

    it("paints a heading with its role and level, and drops both when the element is reused", () => {
        const host = document.createElement("div");
        const cmd = (level?: 1 | 2 | 3): RenderCommand => ({
            kind: "text",
            box: { x: 0, y: 0, w: 100, h: 20 },
            text: { text: "Title", fontId: "f", size: 20, wrap: "words", level },
        });
        paint([cmd(2)], host);
        const el = host.children[0] as HTMLElement;
        expect(el.getAttribute("role")).toBe("heading");
        expect(el.getAttribute("aria-level")).toBe("2");
        paint([cmd(undefined)], host);
        expect((host.children[0] as HTMLElement).getAttribute("role")).toBeNull();
    });

    it("names a background-image frame with its alt text", () => {
        const el = paintOne({
            kind: "image",
            box: { x: 0, y: 0, w: 100, h: 100 },
            image: { src: "p.png", fit: "cover", alt: "A wind farm at dusk" },
        });
        expect(el.getAttribute("role")).toBe("img");
        expect(el.getAttribute("aria-label")).toBe("A wind farm at dusk");
    });

    it("names a zoomed image with a real alt attribute instead", () => {
        const el = paintOne({
            kind: "image",
            box: { x: 0, y: 0, w: 100, h: 100 },
            image: { src: "p.png", fit: "cover", zoom: 1.4, alt: "A wind farm at dusk" },
        });
        expect(el.getAttribute("role")).toBeNull();
        expect(el.querySelector("img")?.alt).toBe("A wind farm at dusk");
    });

    it("the image element carries alt from its data, and omits an empty one", () => {
        const leaf = (alt?: string): string | undefined =>
            getElement("image")!.layout({ src: "p.png", alt }, layoutCtx()).image?.alt;
        expect(leaf("A wind farm at dusk")).toBe("A wind farm at dusk");
        expect(leaf("  ")).toBeUndefined();
        expect(leaf()).toBeUndefined();
    });
});
