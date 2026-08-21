import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, cssOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// The phone tier (device-emulated), which the project config runs under a touch device: tap
// semantics and control-bar anchoring in the editor, and the library grid, whose chrome sits over a
// cover image and so has to size itself for a finger rather than a cursor.

const TOUCH_TARGET = 44; // the @ui `touch` size; below this a control is a miss on a phone

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

// The library defaults to grid and remembers the choice per device, so a phone lands here first.
test.describe("the library grid", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.getByTitle("Grid", { exact: true }).click();
        await expect(page.getByTestId("library-grid")).toBeVisible();
    });

    test("drops to a single column and never scrolls sideways", async ({ page }) => {
        const tracks = (await cssOf(page.getByTestId("library-grid"), "grid-template-columns"))
            .trim()
            .split(/\s+/);
        expect(tracks).toHaveLength(1);

        const width = page.viewportSize()!.width;
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width,
        );
    });

    test("the header controls stay inside the viewport", async ({ page }) => {
        const width = page.viewportSize()!.width;
        for (const control of ["Grid", "List"]) {
            const box = await boxOf(page.getByTitle(control, { exact: true }));
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        }
        const search = await boxOf(page.getByPlaceholder("Search artifacts…"));
        expect(search.x + search.width).toBeLessThanOrEqual(width + 1);
    });

    test("the chrome over a cover is finger-sized and visible without a hover", async ({
        page,
    }) => {
        // a coarse pointer sends no hover, so these are painted from the start rather than revealed
        const next = page.getByTitle("Next section").first();
        await expect(next).toBeVisible();
        const box = await boxOf(next);
        expect(box.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
        expect(box.height).toBeGreaterThanOrEqual(TOUCH_TARGET);

        const select = page.getByTitle("Select").first();
        const mark = await boxOf(select);
        expect(mark.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
        // the glyph is transparent until hover on a fine pointer, which would leave a blank tile here
        expect(await cssOf(select, "color")).not.toBe("rgba(0, 0, 0, 0)");
    });
});
