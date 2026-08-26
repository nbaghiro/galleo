// @vitest-environment happy-dom
// Smoke for the bundled gallery entry: every demo type must render painted tiles through the
// real compose → layout → DOM paint path the page ships with.
import { beforeAll, describe, expect, it } from "vitest";
import { installCanvas2D } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const TYPES = [
    "process",
    "steps",
    "cycle",
    "pyramid",
    "funnel",
    "timeline",
    "quadrant",
    "matrix",
    "hub",
    "org",
];

// Ten types with five variants each, composed and painted for real, so this is a second of work on
// an idle machine and several on a loaded one. The default 5s budget made it fail the whole run
// whenever the box was busy, which reads as a broken gallery rather than a slow test.
const SLOW = 60_000;

describe("diagram gallery entry", () => {
    it(
        "renders every type's variant tiles without a failure card",
        async () => {
            document.body.innerHTML = TYPES.map((t) => `<div id="grid-${t}"></div>`).join("");
            await import("../diagram-gallery.entry");
            for (const t of TYPES) {
                const grid = document.getElementById(`grid-${t}`)!;
                expect(grid.children.length, t).toBeGreaterThanOrEqual(5);
                expect(grid.textContent, t).not.toContain("render failed");
                // each tile hosts real painted content, not an empty box
                const firstHost = grid.querySelector("figure > div")!;
                expect(firstHost.children.length, t).toBeGreaterThan(0);
            }
        },
        SLOW,
    );
});
