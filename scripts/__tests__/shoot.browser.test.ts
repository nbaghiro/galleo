import { describe, expect, it } from "vitest";
import { session } from "../shoot";
import { galleo } from "@services/core/ai/corpus/galleo";

// Real Chromium, so these are slow by unit-test standards but they are the only place the capture
// path is exercised end to end.
const SLOW = 120_000;

describe("headless capture", () => {
    it(
        "captures one image per section plus a strip, and measures through the real painter",
        async () => {
            const content = { ...galleo, sections: galleo.sections.slice(0, 3) };
            const cap = await session((shoot) => shoot(content));
            expect(cap.shots.map((s) => s.id)).toEqual(content.sections.map((s) => s.id));
            // a blank or failed render collapses to a few hundred bytes
            for (const s of cap.shots) expect(s.png.length).toBeGreaterThan(2000);
            expect(cap.strip.length).toBeGreaterThan(2000);
            expect(cap.shapes).toHaveLength(3);
            // the page runs @canvas/render/fit-checks itself, so these are the /eval UI's checks
            // rather than a second implementation: every section must come back covered
            expect(
                new Set(cap.checks.map((c) => c.target).filter((t) => t !== "artifact")),
            ).toEqual(new Set(content.sections.map((s) => `section:${s.id}`)));
            expect(cap.checks.some((c) => c.id === "fits-frame")).toBe(true);
            // the artifact-scope shape checks only exist in fitChecks, so their presence is what
            // proves the page is running it rather than re-deriving checks from raw measurements
            expect(cap.checks.some((c) => c.target === "artifact")).toBe(true);
        },
        SLOW,
    );

    // the guard that keeps a CI run from confidently measuring Times New Roman
    it(
        "refuses to measure when the font CDN is unreachable",
        async () => {
            process.env.GALLEO_BLOCK_FONTS = "1";
            try {
                await expect(session(async () => undefined)).rejects.toThrow(/fonts did not load/);
            } finally {
                delete process.env.GALLEO_BLOCK_FONTS;
            }
        },
        SLOW,
    );
});
