import { describe, expect, it } from "vitest";
import { BREAKPOINTS, surfaceAllowed, tierFor, type Tier } from "@ui/viewport";

describe("tierFor", () => {
    it("splits at the md and lg breakpoints", () => {
        expect(tierFor(BREAKPOINTS.md - 1)).toBe("phone");
        expect(tierFor(BREAKPOINTS.md)).toBe("tablet");
        expect(tierFor(BREAKPOINTS.lg - 1)).toBe("tablet");
        expect(tierFor(BREAKPOINTS.lg)).toBe("desktop");
    });

    it("classifies real device widths", () => {
        expect(tierFor(390)).toBe("phone"); // iPhone portrait
        expect(tierFor(430)).toBe("phone");
        expect(tierFor(834)).toBe("tablet"); // iPad portrait
        expect(tierFor(1024)).toBe("desktop"); // iPad landscape
        expect(tierFor(1440)).toBe("desktop");
    });

    it("never returns desktop for a degenerate width", () => {
        expect(tierFor(0)).toBe("phone");
        expect(tierFor(-100)).toBe("phone");
    });
});

describe("surfaceAllowed", () => {
    const tiers: Tier[] = ["phone", "tablet", "desktop"];

    it("allows consume and manage on every tier", () => {
        for (const t of tiers) {
            expect(surfaceAllowed("consume", t)).toBe(true);
            expect(surfaceAllowed("manage", t)).toBe(true);
        }
    });

    it("withholds direct manipulation from phones only", () => {
        expect(surfaceAllowed("manipulate", "phone")).toBe(false);
        expect(surfaceAllowed("manipulate", "tablet")).toBe(true);
        expect(surfaceAllowed("manipulate", "desktop")).toBe(true);
    });
});
