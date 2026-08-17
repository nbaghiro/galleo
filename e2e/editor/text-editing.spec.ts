import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, cssOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// The regressions this session fixed, pinned: entering edit mode must not rescale the text (the
// overlay styles itself from the painted leaf), and typing + Escape commits back to the paint.

test("click-to-edit opens the overlay at the painted size with no scale jump", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e text", [
        sec("s1", colOf([txt("Alpha headline", "h1"), txt("Beta body copy under it")])),
    ]);
    await page.goto(`/edit/${id}`);

    const painted = paintedText(page, "Alpha headline");
    await expect(painted).toBeVisible();
    const paintedSize = await cssOf(painted, "font-size");
    const paintedBox = await boxOf(painted);

    await painted.click();
    const overlay = page.getByTestId("text-editor");
    await expect(overlay).toBeVisible();

    // same computed font-size as the painted glyphs, and the box hasn't moved sideways
    await expect(overlay).toHaveCSS("font-size", paintedSize);
    const overlayBox = await boxOf(overlay);
    expect(Math.abs(overlayBox.y - paintedBox.y)).toBeLessThan(24);

    await page.keyboard.type(" extended");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("text-editor")).toHaveCount(0);
    await expect(paintedText(page, "Alpha headline extended")).toBeVisible();
});

test("Escape leaves the text unchanged when nothing was typed", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e text 2", [
        sec("s1", colOf([txt("Gamma title", "h2"), txt("Delta paragraph")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Delta paragraph").click();
    await expect(page.getByTestId("text-editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(paintedText(page, "Delta paragraph")).toBeVisible();
});
