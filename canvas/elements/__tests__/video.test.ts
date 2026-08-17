import "@elements/register";
import { describe, expect, it } from "vitest";
import type { LayoutCtx } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes";
import { measure } from "@canvas/testkit";
import { videoElement, videoPoster } from "@elements/media/video";

const ctx: LayoutCtx = {
    box: { x: 0, y: 0, w: 800, h: 450 },
    availWidth: 800,
    format: resolveProfile("deck"),
    theme: resolveTheme("studio").tokens,
    measure,
};

describe("videoPoster", () => {
    it("prefers the stored poster frame", () => {
        expect(
            videoPoster({ src: "https://youtu.be/dQw4w9WgXcQ", poster: "https://p/x.jpg" }),
        ).toBe("https://p/x.jpg");
    });

    it("derives a YouTube thumbnail from watch / short / embed urls", () => {
        for (const src of [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            "https://youtube.com/shorts/dQw4w9WgXcQ",
        ])
            expect(videoPoster({ src })).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    });

    it("has no poster for file sources without one", () => {
        expect(videoPoster({ src: "https://cdn.example.com/clip.mp4" })).toBeUndefined();
        expect(videoPoster({})).toBeUndefined();
    });
});

describe("video layout", () => {
    it("paints the poster as an image leaf so static surfaces show a frame", () => {
        const node = videoElement.layout(
            { src: "https://cdn.example.com/clip.mp4", poster: "https://p/x.jpg" },
            ctx,
        );
        expect(node.image).toMatchObject({ src: "https://p/x.jpg", fit: "cover" });
    });

    it("falls back to the placeholder pill when no poster is known", () => {
        const node = videoElement.layout({ src: "https://cdn.example.com/clip.mp4" }, ctx);
        expect(node.image).toBeUndefined();
        expect(node.fill?.color).toBe("#15171c");
    });
});
