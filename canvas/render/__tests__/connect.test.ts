import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import { inRegion } from "@engine/node";
import type { ArtifactContent, Connection } from "@model/artifact";
import {
    asContent,
    parseRefRegion,
    parseTarget,
    pruneConnections,
    refRegionId,
} from "@model/artifact";
import { DEFAULT_THEME } from "@themes";
import { connectionCommands } from "@canvas/render/connect";

const tk = DEFAULT_THEME.tokens;

const art = (connections: Connection[], moved = false): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    connections,
    sections: [
        {
            id: "s1",
            root: {
                type: "container",
                id: "e-root1",
                data: {
                    direction: "col",
                    children: [
                        { type: "text", id: "e-note", data: { text: "callout" } },
                        // the chart moves to index 2 in the "moved" tree, so its address changes
                        ...(moved ? [{ type: "divider", id: "e-div", data: {} }] : []),
                        { type: "chart", id: "e-chart", data: { type: "column", values: "1,2" } },
                    ],
                },
            },
        },
        {
            id: "s2",
            root: { type: "text", id: "e-far", data: { text: "far away" } },
        },
    ],
});

const conn = (over: Partial<Connection> = {}): Connection => ({
    id: "c1",
    from: { element: "e-note" },
    to: { element: "e-chart" },
    ...over,
});

// stage-space regions the way a stack paint reports them
const regions = (moved = false): Region[] => {
    const chartPath = moved ? "2" : "1";
    return [
        { id: "el:s1", box: { x: 0, y: 0, w: 800, h: 400 } },
        { id: "el:s1:0", box: { x: 40, y: 40, w: 200, h: 60 } },
        { id: `el:s1:${chartPath}`, box: { x: 400, y: 40, w: 320, h: 300 } },
        { id: `datum:el:s1:${chartPath}:1`, box: { x: 500, y: 140, w: 40, h: 200 } },
        { id: "el:s2", box: { x: 0, y: 600, w: 800, h: 100 } },
    ];
};

describe("connectionCommands", () => {
    it("resolves ends by element id, so an arrow follows a moved element", () => {
        const before = connectionCommands(art([conn()]), regions(), tk);
        const after = connectionCommands(art([conn()], true), regions(true), tk);
        expect(before.commands).toHaveLength(1);
        expect(after.commands).toHaveLength(1);
        // both aim at the chart's box wherever it sits in the tree
        const c = after.commands[0]!;
        expect(c.kind).toBe("surface");
        expect(c.box.x + c.box.w).toBeGreaterThan(390);
    });

    it("a datum end lands on the datum region and falls back to the element", () => {
        const hit = connectionCommands(
            art([conn({ to: { element: "e-chart", datum: 1 } })]),
            regions(),
            tk,
        );
        // the datum sits lower than the chart's own anchor, so the route reaches deeper
        expect(hit.commands[0]!.box.y + hit.commands[0]!.box.h).toBeGreaterThan(120);
        const gone = connectionCommands(
            art([conn({ to: { element: "e-chart", datum: 9 } })]),
            regions(),
            tk,
        );
        expect(gone.commands).toHaveLength(1); // degraded to the element box, not dropped
    });

    it("one unresolved end renders nothing", () => {
        const offPage = regions().filter((r) => r.id !== "el:s1:1" && !r.id.startsWith("datum:"));
        expect(connectionCommands(art([conn()]), offPage, tk).commands).toHaveLength(0);
        expect(
            connectionCommands(art([conn({ to: { element: "e-nope" } })]), regions(), tk).commands,
        ).toHaveLength(0);
    });

    it("mints a ref: region that answers along the route and not beside it", () => {
        const { regions: out } = connectionCommands(art([conn()]), regions(), tk);
        expect(out).toHaveLength(1);
        const r = out[0]!;
        expect(parseRefRegion(r.id)).toBe("c1");
        expect(r.shape?.kind).toBe("poly");
        // the route runs between the two boxes; its midpoint hits, a far corner does not
        const mid = { x: (240 + 400) / 2, y: 70 };
        expect(inRegion(r, mid.x, mid.y)).toBe(true);
        expect(inRegion(r, 60, 380)).toBe(false);
    });

    it("cross-section ends resolve when both regions are on the stage", () => {
        const across = connectionCommands(art([conn({ to: { element: "e-far" } })]), regions(), tk);
        expect(across.commands).toHaveLength(1);
    });
});

describe("the model contract", () => {
    it("parseTarget ignores ref: regions", () => {
        expect(parseTarget(refRegionId("c1"))).toBeNull();
    });

    it("asContent round-trips connections and drops an empty list", () => {
        const round = asContent(art([conn()]));
        expect(round.connections).toHaveLength(1);
        expect(asContent({ ...art([conn()]), connections: [] }).connections).toBeUndefined();
    });

    it("prune drops only entries whose end is gone", () => {
        const both = art([conn(), conn({ id: "c2", to: { element: "e-ghost" } })]);
        const pruned = pruneConnections(both);
        expect(pruned.connections?.map((c) => c.id)).toEqual(["c1"]);
        expect(pruneConnections(art([conn()])).connections).toHaveLength(1);
    });
});

describe("paged surfaces", () => {
    it("skipPinned drops a connection into a pinned section", () => {
        const a = art([conn({ to: { element: "e-far" } })]);
        a.sections[1]!.pinned = true;
        const kept = connectionCommands(a, regions(), tk);
        const skipped = connectionCommands(a, regions(), tk, { skipPinned: true });
        expect(kept.commands).toHaveLength(1);
        expect(skipped.commands).toHaveLength(0);
    });
});
