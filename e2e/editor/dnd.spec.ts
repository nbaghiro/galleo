import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, makeArtifact, paintedText, rowOf, sec, txt } from "@e2e/helpers";

// the marker the repaint check stashes in page context, declared so reading it needs no cast
declare global {
    interface Window {
        __marker?: Element;
    }
}

// The frozen-canvas drop-slot system: indicators are overlays, the canvas never reflows during a
// drag, the single mutation happens at drop.

// grab an element's grip: hover the element so the DragHandle mounts, then drag from the grip
async function dragFrom(
    page: import("@playwright/test").Page,
    target: { x: number; y: number },
    moves: { x: number; y: number }[],
): Promise<void> {
    await page.mouse.move(target.x, target.y);
    const grip = page.getByTitle("Drag to move");
    // hover registration can lose a race with the windowed first paint; re-hover until the
    // grip mounts
    for (let i = 0; i < 6 && !(await grip.isVisible().catch(() => false)); i++) {
        await page.waitForTimeout(250);
        await page.mouse.move(target.x + 30, target.y + 6);
        await page.mouse.move(target.x, target.y);
    }
    await expect(grip).toBeVisible();
    const g = await boxOf(grip);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (const m of moves) await page.mouse.move(m.x, m.y, { steps: 8 });
}

test("moving an element shows indicators without reflow and drops at the line", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e dnd", [
        sec("s1", rowOf([txt("AAA first"), txt("BBB second"), txt("CCC third")])),
    ]);
    await page.goto(`/edit/${id}`);
    const a = paintedText(page, "AAA first");
    await expect(a).toBeVisible();
    const aBox = await boxOf(a);
    const cBox = await boxOf(paintedText(page, "CCC third"));

    // mark a painted node so we can prove the canvas did not repaint mid-drag
    await page.evaluate(() => {
        const el = document.querySelector("main .absolute.inset-0 > *");
        if (el) window.__marker = el;
    });

    await dragFrom(page, { x: aBox.x + 10, y: aBox.y + 10 }, [
        { x: aBox.x + 60, y: aBox.y + 40 },
        { x: cBox.x + cBox.width - 4, y: cBox.y + cBox.height / 2 },
    ]);

    // overlays are up: ghost follows the cursor, the source is veiled, indicators mark the slots
    await expect(page.getByTestId("drag-ghost")).toBeVisible();
    await expect(page.getByTestId("lift-veil")).toBeVisible();
    await expect(page.getByTestId("drop-active")).toBeVisible();

    // the canvas has not repainted while dragging
    expect(await page.evaluate(() => window.__marker?.isConnected ?? false)).toBe(true);

    await page.mouse.up();
    // the pill variant stays mounted display:none, so hidden is the truth
    await expect(page.getByTestId("drag-ghost")).toBeHidden();

    // AAA landed after CCC (poll: the commit repaint lands asynchronously)
    await expect(async () => {
        const aAfter = await boxOf(paintedText(page, "AAA first"));
        const cAfter = await boxOf(paintedText(page, "CCC third"));
        expect(aAfter.x).toBeGreaterThan(cAfter.x);
    }).toPass({ timeout: 5000 });

    // the whole move is one undo step
    await page.keyboard.press("ControlOrMeta+z");
    await expect(async () => {
        const aBack = await boxOf(paintedText(page, "AAA first"));
        const cBack = await boxOf(paintedText(page, "CCC third"));
        expect(aBack.x).toBeLessThan(cBack.x);
    }).toPass({ timeout: 5000 });
});

test("a section drag offers only gap lines and reorders on drop", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e section dnd", [
        sec("s1", colOf([txt("Top section marker")])),
        sec("s2", colOf([txt("Bottom section marker")])),
    ]);
    await page.goto(`/edit/${id}`);
    const top = paintedText(page, "Top section marker");
    await expect(top).toBeVisible();
    const topBox = await boxOf(top);
    const bottomBox = await boxOf(paintedText(page, "Bottom section marker"));

    // hover the section's padding (left of the element) so the grip targets the SECTION
    await page.mouse.move(topBox.x - 40, topBox.y + 4);
    const grip = page.getByTitle("Drag to move");
    await expect(grip).toBeVisible();
    const g = await boxOf(grip);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(topBox.x + 100, bottomBox.y + 80, { steps: 10 });

    await expect(page.getByTestId("lift-veil")).toBeVisible();
    // a section only lands in the stack gaps: no element-level candidates
    await expect(page.getByTestId("drop-active")).toBeVisible();

    await page.mouse.up();
    // poll: the commit repaint lands asynchronously
    await expect(async () => {
        const topAfter = await boxOf(paintedText(page, "Top section marker"));
        const bottomAfter = await boxOf(paintedText(page, "Bottom section marker"));
        expect(topAfter.y).toBeGreaterThan(bottomAfter.y);
    }).toPass({ timeout: 5000 });
});

test("holding a drag at the viewport edge autoscrolls the stack", async ({ page }) => {
    const sections = Array.from({ length: 10 }, (_, i) =>
        sec(`s${i + 1}`, colOf([txt(`Filler section ${i + 1} with some copy`)])),
    );
    const id = await makeArtifact(page.request, "e2e autoscroll", sections);
    await page.goto(`/edit/${id}`);
    // exact text: a "Filler section 1" substring would also match section 10 at the fold
    const first = paintedText(page, "Filler section 2 with some copy");
    await expect(first).toBeVisible();
    // ten estimated section heights settle over the first repaints; measure after the shifts
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    const fBox = await boxOf(first);

    await dragFrom(page, { x: fBox.x + 10, y: fBox.y + 10 }, [{ x: fBox.x + 80, y: fBox.y + 60 }]);
    const before = await page.evaluate(() => document.querySelector("main")!.scrollTop);
    const viewport = page.viewportSize()!;
    await page.mouse.move(viewport.width / 2, viewport.height - 20, { steps: 5 });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => document.querySelector("main")!.scrollTop);
    await page.mouse.up();
    expect(after).toBeGreaterThan(before);
});
