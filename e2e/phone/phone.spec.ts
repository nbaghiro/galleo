import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, cssOf, makeArtifact, paintedText, sec, swipe, txt } from "@e2e/helpers";

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

        // `main` is the scroller, and `overflow-y-auto` computes overflow-x to auto with it, so a
        // too-wide row scrolls there rather than growing the document
        const overflow = await page
            .locator("main")
            .evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });

    test("the search field gets a line of its own instead of being squeezed", async ({ page }) => {
        const toggle = await boxOf(page.getByTitle("Grid", { exact: true }));
        const search = await boxOf(page.getByPlaceholder("Search artifacts…"));
        // sharing the row with the layout toggle shrinks the field to ~150px rather than overflowing
        expect(search.y).toBeGreaterThan(toggle.y + toggle.height - 4);
        expect(search.width).toBeGreaterThan(240);
        expect(search.x + search.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    });

    test("the chrome over a cover is finger-sized and visible without a hover", async ({
        page,
    }) => {
        // a coarse pointer sends no hover, so what stays must be painted from the start
        const select = page.getByTitle("Select").first();
        await expect(select).toBeVisible();
        const mark = await boxOf(select);
        expect(mark.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
        expect(mark.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
        const menu = await boxOf(page.getByTitle("Move to folder").first());
        expect(menu.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
    });

    test("the carousel is swiped, not arrowed, and the swipe does not open the artifact", async ({
        page,
    }) => {
        // a one-section card has nowhere to step, so the subject is made rather than found
        const id = await makeArtifact(page.request, "e2e phone swipe", [
            sec("s1", colOf([txt("One", "h2")])),
            sec("s2", colOf([txt("Two", "h2")])),
            sec("s3", colOf([txt("Three", "h2")])),
        ]);
        await page.goto("/");

        // arrows big enough for a finger would cover the cover they sit on, so touch gets neither
        await expect(page.getByTitle("Next section")).toHaveCount(0);
        await expect(page.getByTitle("Previous section")).toHaveCount(0);

        const card = page
            .getByTestId("library-grid")
            .locator("> div")
            .filter({ hasText: "e2e phone swipe" });
        const badge = card.getByTestId("card-position");
        await expect(badge).toHaveText("1/3"); // no cover image, so it opens on the first section

        const cover = await boxOf(card.locator("button").first());
        await swipe(page, cover, -(cover.width - 40));

        await expect(badge).toHaveText("2/3");
        await expect(page).toHaveURL(/\/$/); // a swipe is not a tap: it must not navigate

        await page.request.post(`/api/artifacts/${id}/trash`); // reruns should not accumulate
    });
});
