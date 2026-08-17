// Browser entry for the diagram comparison gallery. Bundled with esbuild and inlined into a
// static page, it renders every diagram type through the exact pipeline the studio uses:
// the element's container path (children → arrange) → the engine solver with the real
// canvas-measureText → the DOM paint backend. Lives in scripts/ (outside the layer law).

import "@elements/register";
import { getElement } from "@elements/spec";
import type { LayoutCtx } from "@elements/spec";
import { layout } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { measureText } from "@canvas/render/commands";
import { paint } from "@canvas/render/backends";
import { resolveTheme } from "@themes";

const W = 560;
const H = 240;

const DEMO: Record<string, Record<string, unknown>> = {
    process: { items: "Research, Design, Build, Test, Launch" },
    steps: { items: "Crawl | prove the basics\nWalk | expand the surface\nRun | scale it up" },
    cycle: { items: "Plan, Do, Check, Act" },
    pyramid: { items: "Vision, Strategy, Tactics, Operations" },
    funnel: {
        items: "Awareness | | 100\nInterest | | 70\nConsideration | | 45\nIntent | | 25\nPurchase | | 12",
    },
    timeline: { items: "Founded, Seed round, Series A, Expansion, IPO" },
    quadrant: {
        items: "Quick wins, Major projects, Fill-ins, Thankless tasks",
        axes: "Low effort, High effort, Low impact, High impact",
    },
    matrix: {
        items: "Strengths, Weaknesses, Opportunities, Threats",
        axes: "Helpful, Harmful, Internal, External",
    },
    hub: { items: "Platform, Billing, Identity, Insights, Support, Partners" },
    org: {
        items: "CEO, CTO, CFO, VP Eng, VP Sales",
        links: "CEO>CTO, CEO>CFO, CTO>VP Eng, CFO>VP Sales",
    },
};

const STYLES = ["solid", "tinted", "card", "outline"] as const;
const SHAPE_TYPES = new Set(["process", "steps", "cycle", "hub", "matrix"]);
const SHAPES = ["pill", "chevron", "hexagon"] as const;

function renderInto(host: HTMLElement, data: Record<string, unknown>): void {
    const theme = resolveTheme("").tokens;
    const spec = getElement("diagram")!;
    const box = { x: 0, y: 0, w: W, h: H };
    const ctx: LayoutCtx = {
        box,
        availWidth: W,
        format: resolveProfile("deck"),
        theme,
        measure: measureText,
        plain: true,
    };
    const full = { ...data, height: H };
    const kids = spec
        .container!.children(full)
        .map((child) => getElement(child.type)!.layout(child.data, ctx));
    const node = spec.container!.arrange(full, ctx, kids);
    const { commands } = layout(node, box, measureText);
    host.style.position = "relative";
    host.style.width = `${W}px`;
    host.style.height = `${H}px`;
    host.style.background = theme.surface;
    host.style.overflow = "hidden";
    paint(commands, host);
}

function tile(grid: HTMLElement, label: string, data: Record<string, unknown>): void {
    const cell = document.createElement("figure");
    cell.className = "tile";
    const host = document.createElement("div");
    const cap = document.createElement("figcaption");
    cap.textContent = label;
    cell.appendChild(host);
    cell.appendChild(cap);
    grid.appendChild(cell);
    try {
        renderInto(host, data);
    } catch (err) {
        host.textContent = `render failed: ${String(err)}`;
        host.style.color = "#c33";
        host.style.font = "12px monospace";
        host.style.padding = "12px";
    }
}

function run(): void {
    for (const [type, data] of Object.entries(DEMO)) {
        const grid = document.getElementById(`grid-${type}`);
        if (!grid) continue;
        for (const style of STYLES) tile(grid, style, { ...data, type, style });
        if (SHAPE_TYPES.has(type)) {
            for (const shape of SHAPES)
                tile(grid, `solid · ${shape}`, { ...data, type, shape, numbers: "number" });
        } else {
            tile(grid, "solid · numbered", { ...data, type, numbers: "number" });
        }
    }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
else run();
