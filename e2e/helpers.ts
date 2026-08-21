import type { APIRequestContext, Locator, Page } from "@playwright/test";

// Spec-owned artifacts: every spec authors its exact content and gets a fresh id, so specs stay
// parallel-safe and never mutate the seeded fixtures.

export interface El {
    type: string;
    data: Record<string, unknown>;
    layout?: Record<string, unknown>;
}

export const txt = (text: string, style = "body"): El => ({ type: "text", data: { text, style } });
export const rowOf = (children: El[]): El => ({
    type: "group",
    data: { direction: "row", children },
});
export const colOf = (children: El[]): El => ({
    type: "group",
    data: { direction: "col", children },
});
export const sec = (id: string, root: El): { id: string; root: El } => ({ id, root });

export async function makeArtifact(
    request: APIRequestContext,
    title: string,
    sections: { id: string; root: El }[],
): Promise<string> {
    const res = await request.post("/api/artifacts", {
        data: { title, draftContent: { format: "deck", theme: "base", sections } },
    });
    if (!res.ok()) throw new Error(`makeArtifact "${title}" failed: ${res.status()}`);
    const body = (await res.json()) as { id: string };
    return body.id;
}

// canvas-scoped queries: the minimap repeats every text at thumbnail scale, so an unscoped
// getByText can match a thumb instead of the painted canvas
export const stage = (page: Page): Locator => page.locator("main");

// the painted glyph node itself: getByText also matches every ancestor whose text contains the
// string, and document order puts ancestors first, so take the deepest match inside the canvas
export const paintedText = (page: Page, text: string, exact = true): Locator =>
    stage(page).getByText(text, { exact }).filter({ visible: true }).last();

// exact-count queries go to the run spans the painter emits, so wrappers don't double-count
export const paintedSpans = (page: Page, text: RegExp): Locator =>
    stage(page).locator("span").filter({ hasText: text, visible: true });

// measurement with a stale-node retry: the windowed loader repaints placeholders into final
// content, which can detach a matched node between the visibility check and the read
export async function boxOf(
    locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
    for (let i = 0; i < 20; i++) {
        const box = await locator.boundingBox().catch(() => null);
        if (box) return box;
        await locator.page().waitForTimeout(150);
    }
    throw new Error("boundingBox stayed null");
}

export async function cssOf(locator: Locator, prop: string): Promise<string> {
    for (let i = 0; i < 20; i++) {
        const v = await locator
            .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p as string), prop)
            .catch(() => "");
        if (v) return v;
        await locator.page().waitForTimeout(150);
    }
    throw new Error(`computed ${prop} stayed empty`);
}

// A real touch swipe. Playwright's touchscreen only taps, and a mouse drag is not a substitute: on
// a draggable element it starts native HTML5 drag and the page gets a pointercancel a few px in.
// Negative dx swipes leftward, which is the "next" direction.
export async function swipe(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
    dx: number,
    steps = 8,
): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    const from = dx < 0 ? box.x + box.width - 20 : box.x + 20;
    const at = (x: number): { touchPoints: { x: number; y: number; id: number }[] } => ({
        touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", ...at(from) });
    for (let i = 1; i <= steps; i++)
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            ...at(from + (dx * i) / steps),
        });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
}
