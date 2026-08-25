import { expect, test } from "@e2e/fixtures";
import type { Locator } from "@playwright/test";
import { colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// Click near the left edge rather than the centre. Selecting an element floats the toolbar over the
// stage, centred on the selection, and a full-width text block below it sits under that bar: a
// centre click lands on the toolbar instead of the text. The left margin of the block stays clear.
const EDGE = { x: 8, y: 8 } as const;
const pick = (l: Locator, shift = false): Promise<void> =>
    l.click({ position: EDGE, ...(shift ? { modifiers: ["Shift" as const] } : {}) });

// Shift-click builds a set beside the anchor, and the set unlocks the actions that need one:
// group, ungroup, and a single undo entry for the whole gesture.

test("shift-click builds a set that groups, ungroups, and undoes as one step", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e multi select", [
        sec("s1", colOf([txt("Alpha one"), txt("Beta two"), txt("Gamma three")])),
    ]);
    await page.goto(`/edit/${id}`);
    await pick(paintedText(page, "Alpha one"));
    await page.keyboard.press("Escape"); // editing → element selected

    await pick(paintedText(page, "Beta two"), true);
    await pick(paintedText(page, "Gamma three"), true);

    const flyout = page.getByTestId("right-flyout");
    await expect(flyout.getByText("3 selected")).toBeVisible();
    // the anchor keeps its own ring, so only the other two are extras
    await expect(page.getByTestId("selection-extra")).toHaveCount(2);

    // shift-clicking a member takes it back out, and again puts it back
    await pick(paintedText(page, "Gamma three"), true);
    await expect(flyout.getByText("2 selected")).toBeVisible();
    await pick(paintedText(page, "Gamma three"), true);
    await expect(flyout.getByText("3 selected")).toBeVisible();

    await flyout.getByRole("button", { name: "Group" }).click();
    // the set collapses into the one container it made: no extras left, and the flyout closes with
    // the multi-selection that opened it, so what stands as evidence is the ungroup control
    await expect(page.getByTestId("selection-extra")).toHaveCount(0);
    await expect(page.getByTitle("Ungroup")).toBeVisible();

    await page.getByTitle("Ungroup").click();
    await expect(flyout.getByText("3 selected")).toBeVisible();
    await expect(paintedText(page, "Beta two")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+z"); // back to the grouped tree
    await expect(page.getByTestId("selection-extra")).toHaveCount(0);
    await expect(paintedText(page, "Gamma three")).toBeVisible();
});

test("a plain click collapses the set back to one element", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e multi collapse", [
        sec("s1", colOf([txt("First line"), txt("Second line")])),
    ]);
    await page.goto(`/edit/${id}`);
    await pick(paintedText(page, "First line"));
    await page.keyboard.press("Escape");
    await pick(paintedText(page, "Second line"), true);
    await expect(page.getByTestId("selection-extra")).toHaveCount(1);

    await pick(paintedText(page, "First line"));
    await expect(page.getByTestId("selection-extra")).toHaveCount(0);
});
