import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// The section Layout popup: preset previews render through the real pipeline and apply on click.

test("a layout preset previews, applies, and reflows the section", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e layout", [
        sec("s1", colOf([txt("First block of copy"), txt("Second block of copy")])),
    ]);
    await page.goto(`/edit/${id}`);
    const first = paintedText(page, "First block of copy");
    await expect(first).toBeVisible();

    // stacked to start: second sits below first
    const b1 = await boxOf(first);
    const b2 = await boxOf(paintedText(page, "Second block of copy"));
    expect(b2.y).toBeGreaterThan(b1.y + b1.height - 1);

    // the section pill appears on hover; Layout opens the popup
    await page.mouse.move(b1.x + 40, b1.y + 10);
    await page.getByRole("button", { name: "Layout", exact: true }).click();
    await page.getByTitle("Two columns").click();

    // applied: the content moves into column 1 of 2, so its measure halves; column 2 is the
    // empty drop region (splits redistribute columns, they do not scatter leaves)
    await expect(async () => {
        const a1 = await boxOf(paintedText(page, "First block of copy"));
        expect(a1.width).toBeLessThan(b1.width * 0.7);
    }).toPass({ timeout: 4000 });
});
