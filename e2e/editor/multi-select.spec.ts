import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// Shift-click builds a set beside the anchor, and the set unlocks the actions that need one:
// group, ungroup, and a single undo entry for the whole gesture.

test("shift-click builds a set that groups, ungroups, and undoes as one step", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e multi select", [
        sec("s1", colOf([txt("Alpha one"), txt("Beta two"), txt("Gamma three")])),
    ]);
    await page.goto(`/edit/${id}`);
    await paintedText(page, "Alpha one").click();
    await page.keyboard.press("Escape"); // editing → element selected

    await paintedText(page, "Beta two").click({ modifiers: ["Shift"] });
    await paintedText(page, "Gamma three").click({ modifiers: ["Shift"] });

    const flyout = page.getByTestId("right-flyout");
    await expect(flyout.getByText("3 selected")).toBeVisible();
    // the anchor keeps its own ring, so only the other two are extras
    await expect(page.getByTestId("selection-extra")).toHaveCount(2);

    // shift-clicking a member takes it back out, and again puts it back
    await paintedText(page, "Gamma three").click({ modifiers: ["Shift"] });
    await expect(flyout.getByText("2 selected")).toBeVisible();
    await paintedText(page, "Gamma three").click({ modifiers: ["Shift"] });
    await expect(flyout.getByText("3 selected")).toBeVisible();

    await flyout.getByRole("button", { name: "Group" }).click();
    await expect(page.getByTestId("selection-extra")).toHaveCount(0);
    await expect(flyout.getByText("Container")).toBeVisible();

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
    await paintedText(page, "First line").click();
    await page.keyboard.press("Escape");
    await paintedText(page, "Second line").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("selection-extra")).toHaveCount(1);

    await paintedText(page, "First line").click();
    await expect(page.getByTestId("selection-extra")).toHaveCount(0);
});
