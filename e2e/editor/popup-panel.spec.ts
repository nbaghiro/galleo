import type { Page } from "@playwright/test";
import { expect, test } from "@e2e/fixtures";
import {
    boxOf,
    colOf,
    cssOf,
    makeArtifact,
    paintedText,
    rowOf,
    sec,
    txt,
    type El,
} from "@e2e/helpers";

// A popup's panel is chrome on every surface: it floats over the canvas instead of taking room in
// the section, and everything inside it is still an ordinary addressed element.

const BRAND = "STUDIO NORTH";
const UNDER = "The section under the nav.";
const FIRST = "First item";
const SECOND = "Second item";

const menu: El = {
    type: "popup",
    data: { label: "More", variant: "menu", open: true, children: [txt(FIRST), txt(SECOND)] },
};

const build = (page: Page): Promise<string> =>
    makeArtifact(
        page.request,
        "e2e popup panel",
        [
            sec("nav", rowOf([txt(BRAND, "label"), menu]), { pinned: true }),
            sec("body", colOf([txt(UNDER)])),
        ],
        "web",
    );

test("the panel floats over the canvas without changing the section it hangs off", async ({
    page,
}) => {
    await page.goto(`/edit/${await build(page)}`);
    const item = paintedText(page, FIRST);
    await expect(item).toBeVisible();

    const trigger = await boxOf(paintedText(page, "More"));
    const itemBox = await boxOf(item);
    // the panel hangs below the trigger and is far wider than the row slot the trigger sits in
    expect(itemBox.y).toBeGreaterThan(trigger.y);
    expect(itemBox.width).toBeGreaterThan(trigger.width * 1.5);

    const openBrand = await boxOf(paintedText(page, BRAND));
    const openUnder = await boxOf(paintedText(page, UNDER));

    // closing it moves nothing: the panel never occupied any of the layout
    await paintedText(page, "More").click();
    await expect(paintedText(page, FIRST)).toHaveCount(0);
    const shutBrand = await boxOf(paintedText(page, BRAND));
    const shutUnder = await boxOf(paintedText(page, UNDER));
    expect(shutBrand.y).toBeCloseTo(openBrand.y, 0);
    expect(shutUnder.y).toBeCloseTo(openUnder.y, 0);

    // and the trigger toggles it straight back
    await paintedText(page, "More").click();
    await expect(paintedText(page, FIRST)).toBeVisible();
});

test("a panel item selects, multi-selects, and edits inline at the painted size", async ({
    page,
}) => {
    await page.goto(`/edit/${await build(page)}`);
    const item = paintedText(page, FIRST);
    await expect(item).toBeVisible();
    const paintedSize = await cssOf(item, "font-size");
    const paintedBox = await boxOf(item);

    await item.click();
    const overlay = page.getByTestId("text-editor");
    await expect(overlay).toBeVisible();
    // the overlay is styled from the panel's own compose, not the section's
    await expect(overlay).toHaveCSS("font-size", paintedSize);
    const overlayBox = await boxOf(overlay);
    expect(Math.abs(overlayBox.y - paintedBox.y)).toBeLessThan(24);
    expect(Math.abs(overlayBox.x - paintedBox.x)).toBeLessThan(24);

    await page.keyboard.type(" edited");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("text-editor")).toHaveCount(0);
    await expect(paintedText(page, `${FIRST} edited`)).toBeVisible();

    // two panel children are an ordinary set: the same shift-click as anywhere else on the canvas
    await paintedText(page, SECOND).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("selection-extra")).toHaveCount(1);
});
