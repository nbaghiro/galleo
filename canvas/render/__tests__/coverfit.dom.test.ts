// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { sectionSlides } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { colGroup } from "@model/artifact";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");

// The shape prepareSlideNode's coverFitMedia targets: one dominant aspect-media plus a caption, in a
// container with 2+ cells. The media is meant to absorb the slide's slack (h: grow) instead of the
// whole section scaling down.
const photoWithCaption = sectionOf(
    colGroup([
        inst("image", { src: "dune.png" }),
        inst("text", {
            style: "body",
            text: "Gion, 5:48. The teahouse lanterns are dark, the cobbles wet from a rain that came and went while the city slept.",
        }),
    ]),
);

describe("a photo + caption section fills its slide", () => {
    it("paints something", () => {
        const [page] = sectionSlides(photoWithCaption, tokens, deck);
        expect(page).toBeDefined();
        expect(page!.commands.length).toBeGreaterThan(0);
    });

    it("the image keeps a real height instead of collapsing to zero", () => {
        const [page] = sectionSlides(photoWithCaption, tokens, deck);
        const images = page!.commands.filter((c) => c.kind === "image");
        expect(images.length).toBeGreaterThan(0);
        const tallest = Math.max(...images.map((c) => c.box.h));
        expect(tallest).toBeGreaterThan(100);
    });

    it("the content spans a meaningful part of the 720px frame", () => {
        const [page] = sectionSlides(photoWithCaption, tokens, deck);
        const bottom = page!.commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
        expect(bottom).toBeGreaterThan(deck.height === 720 ? 300 : 300);
    });
});
