/* eslint-disable no-console */
// Engine sizing tests (throw-based, run via `pnpm test`). Pin the Clay-style grow/shrink pass in
// canvas/engine/layout.ts: even grow, percent-against-avail (60/40 + gap), fit overflow → shrink,
// grow min/max, fixed no-shrink, and column-height grow. No framework — assert + throw.

import { layout } from "@engine/layout";
import { resolveProfile, slideFrame } from "@engine/profile";
import type { EngineNode, MeasureText, Region } from "@engine/node";
import { fit, fixed, grow, percent } from "@model/geometry";
import type { Size } from "@model/geometry";
import type { Section } from "@model/artifact";

// Deterministic text metrics: 8px per char (unwrapped), 16px per line, wrapping at maxWidth.
const measure: MeasureText = (leaf, maxW) => {
    const unwrapped = leaf.text.length * 8;
    if (leaf.wrap === "none" || !Number.isFinite(maxW)) return { width: unwrapped, height: 16 };
    const lines = Math.max(1, Math.ceil(unwrapped / Math.max(1, maxW)));
    return { width: Math.min(unwrapped, maxW), height: lines * 16 };
};

let passed = 0;
function ok(name: string, cond: boolean): void {
    if (!cond) throw new Error(`FAIL: ${name}`);
    console.log(`  ok  ${name}`);
    passed++;
}
const near = (a: number, b: number, eps = 1): boolean => Math.abs(a - b) <= eps;

function boxOf(id: string, regions: Region[]): { x: number; y: number; w: number; h: number } {
    const r = regions.find((x) => x.id === id);
    if (!r) throw new Error(`no region "${id}"`);
    return r.box;
}
const run = (root: EngineNode, w: number, h: number): Region[] =>
    layout(root, { x: 0, y: 0, w, h }, measure).regions;
const cell = (id: string, ws: Size, hs: Size): EngineNode => ({
    id,
    w: ws,
    h: hs,
    fill: { color: "#000" },
});
const row = (kids: EngineNode[], w: number, gap = 0): EngineNode => ({
    w: fixed(w),
    h: fixed(200),
    direction: "row",
    gap,
    children: kids,
});

// 1. two grow columns split the row evenly
{
    const r = run(row([cell("a", grow(), grow()), cell("b", grow(), grow())], 200), 200, 200);
    ok("grow: even split", near(boxOf("a", r).w, 100) && near(boxOf("b", r).w, 100));
}

// 2. percent + gap resolve against the space after the gap → 60/40 fills exactly, no overflow
{
    const r = run(
        row([cell("a", percent(0.6), grow()), cell("b", percent(0.4), grow())], 200, 20),
        200,
        200,
    );
    const a = boxOf("a", r);
    const b = boxOf("b", r);
    ok("percent+gap: 60/40 of avail (180)", near(a.w, 108) && near(b.w, 72));
    ok("percent+gap: right edge lands on the container", near(b.x + b.w, 200));
}

// 3. two fit text columns wider than the row → shrink to fit (each intrinsic 160 → 50)
{
    const t = (id: string): EngineNode => ({
        id,
        w: fit(),
        h: grow(),
        text: { text: "x".repeat(20), fontId: "f", size: 12, wrap: "words" },
    });
    const r = run(row([t("a"), t("b")], 100), 100, 200);
    ok(
        "shrink: fit columns compress to fit",
        near(boxOf("a", r).w, 50) && near(boxOf("b", r).w, 50),
    );
}

// 4. grow max caps a column; the other takes the remainder
{
    const r = run(
        row([cell("a", grow(undefined, 50), grow()), cell("b", grow(), grow())], 200),
        200,
        200,
    );
    ok(
        "grow: max caps at 50, remainder to sibling",
        near(boxOf("a", r).w, 50) && near(boxOf("b", r).w, 150),
    );
}

// 5. grow min floors a column even when space is tight
{
    const r = run(row([cell("a", grow(120), grow()), cell("b", grow(), grow())], 150), 150, 200);
    const a = boxOf("a", r);
    const b = boxOf("b", r);
    ok("grow: min floor honored", a.w >= 119 && near(a.w + b.w, 150));
}

// 6. fixed columns never shrink (they overflow rather than compress)
{
    const r = run(
        row([cell("a", fixed(100), grow()), cell("b", fixed(100), grow())], 150),
        150,
        200,
    );
    ok("fixed: no shrink (overflows)", near(boxOf("a", r).w, 100) && near(boxOf("b", r).w, 100));
}

// 7. column heights: a grow child fills the leftover under a fixed one
{
    const col: EngineNode = {
        w: fixed(100),
        h: fixed(200),
        direction: "col",
        children: [cell("a", grow(), fixed(50)), cell("b", grow(), grow())],
    };
    const r = run(col, 100, 200);
    ok("col height: grow fills the leftover", near(boxOf("b", r).h, 150));
}

// 8. floating: a badge lifted out of flow, aligned bottom-right, painted on top of the flow
{
    const parent: EngineNode = {
        w: fixed(200),
        h: fixed(100),
        direction: "col",
        children: [
            cell("body", grow(), grow()),
            {
                id: "badge",
                w: fixed(40),
                h: fixed(20),
                fill: { color: "#f00" },
                float: { x: "end", y: "end" },
            },
        ],
    };
    const { regions: reg, commands } = layout(parent, { x: 0, y: 0, w: 200, h: 100 }, measure);
    const body = boxOf("body", reg);
    const badge = boxOf("badge", reg);
    ok("float: does not consume flow space", near(body.h, 100) && near(body.w, 200));
    ok(
        "float: aligned bottom-right of the content box",
        near(badge.x + badge.w, 200) && near(badge.y + badge.h, 100),
    );
    const bodyIdx = commands.findIndex((c) => c.id === "body");
    const badgeIdx = commands.findIndex((c) => c.id === "badge");
    ok("float: painted after (on top of) the flow", badgeIdx > bodyIdx);
}

// 9. slideFrame: paged frame from the profile, overridden by a section's own aspect (custom dimensions)
{
    const deck = resolveProfile("deck");
    const plain: Section = { id: "s", root: { type: "group", data: { children: [] } } };
    const f0 = slideFrame(plain, deck);
    ok("frame: deck default is 1280×720", f0.w === 1280 && f0.h === 720);
    ok("frame: aspect 1 → square", slideFrame({ ...plain, frame: { aspect: 1 } }, deck).h === 1280);
    ok(
        "frame: aspect 21/9 → shorter frame",
        slideFrame({ ...plain, frame: { aspect: 21 / 9 } }, deck).h === 549,
    );
}

console.log(`\n${passed} checks passed.`);
