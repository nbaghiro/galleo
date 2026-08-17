import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// The phone tier (device-emulated): tap semantics and the control bar anchoring shipped this
// session. The project config runs these under devices["iPhone 14"].

test("first tap selects, second tap edits", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e phone taps", [
        sec("s1", colOf([txt("Tap me twice to edit", "h2"), txt("Other copy")])),
    ]);
    await page.goto(`/edit/${id}`);
    const target = paintedText(page, "Tap me twice to edit");
    await expect(target).toBeVisible();

    await target.tap();
    // first tap: selection only, no keyboard-summoning editor
    await expect(page.getByTestId("text-editor")).toHaveCount(0);

    await target.tap();
    await expect(page.getByTestId("text-editor")).toBeVisible();
});

test("the control bar anchors above the selection, centred and inside the viewport", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e phone bar", [
        sec("s1", colOf([txt("Filler above"), txt("Bar anchor target", "h3"), txt("Below")])),
    ]);
    await page.goto(`/edit/${id}`);
    const target = paintedText(page, "Bar anchor target");
    await target.tap();

    const bar = page.locator("[data-galleo-toolbar]").first();
    await expect(bar).toBeVisible();
    const barBox = await boxOf(bar);
    const targetBox = await boxOf(target);
    const viewport = page.viewportSize()!;

    expect(barBox.y + barBox.height).toBeLessThanOrEqual(targetBox.y + 2); // above the selection
    expect(barBox.x).toBeGreaterThanOrEqual(0);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1); // never overflows
    const barCentre = barBox.x + barBox.width / 2;
    expect(Math.abs(barCentre - viewport.width / 2)).toBeLessThan(40); // centred on the viewport
});
