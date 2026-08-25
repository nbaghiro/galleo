import { expect, test } from "@e2e/fixtures";
import {
    colOf,
    makeArtifact,
    paintedSpans,
    paintedText,
    rowOf,
    sec,
    stage,
    txt,
} from "@e2e/helpers";

// The context bar's color control and the keyboard map, on spec-owned artifacts.

test("an unset color override shows the inherited tone as Auto, sets, and resets", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e swatch", [
        sec("s1", colOf([txt("Swatch target headline", "h2"), txt("Sibling")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Swatch target headline").click();

    // the bar's color trigger reads Auto while no override is set
    const trigger = page.getByRole("button", { name: /auto/i }).first();
    await expect(trigger).toBeVisible();

    await trigger.click();
    await page.getByTitle("Accent").first().click();
    await expect(page.getByRole("button", { name: /#/ }).first()).toBeVisible();

    // reset returns to inherited
    await page.getByRole("button", { name: /#/ }).first().click();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByRole("button", { name: /auto/i }).first()).toBeVisible();
});

test("Delete collapses the emptied column and undo restores it", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e delete", [
        sec("s1", rowOf([txt("Left cell"), txt("Right cell")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Left cell").click();
    await page.keyboard.press("Escape"); // editing → selection
    await page.keyboard.press("Delete");
    await expect(paintedSpans(page, /^Left cell$/)).toHaveCount(0);
    await expect(paintedText(page, "Right cell")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+z");
    await expect(paintedText(page, "Left cell")).toBeVisible();
});

test("duplicate makes a sibling copy", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e duplicate", [
        sec("s1", colOf([txt("Unique phrase here"), txt("Anchor")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Unique phrase here").click();
    await page.keyboard.press("Escape");
    const matches = stage(page).getByText("Unique phrase here", { exact: true });
    // Leaving the text editor repaints the section, so the count has to settle before it is the
    // baseline: reading it mid-repaint gives 0, and the assertion below then expects 0 of them.
    await expect(matches).not.toHaveCount(0);
    const before = await matches.count();
    await page.keyboard.press("ControlOrMeta+d");
    // every painted layer of the text doubles, whatever the wrapper structure is
    await expect(matches).toHaveCount(before * 2);
});

test("Escape walks selection up the tree and out", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e esc walk", [
        sec("s1", rowOf([txt("Walk from me"), txt("Neighbour")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Walk from me").click();
    await page.keyboard.press("Escape"); // stop editing → element selected
    await expect(page.getByTestId("text-editor")).toHaveCount(0);
    await page.keyboard.press("Escape"); // element → parent row
    await page.keyboard.press("Escape"); // row (section root) → section
    await page.keyboard.press("Escape"); // section → nothing
    // with nothing selected, Delete deletes nothing
    await page.keyboard.press("Delete");
    await expect(paintedText(page, "Walk from me")).toBeVisible();
});
