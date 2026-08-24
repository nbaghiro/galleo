import { expect, statePath, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Library CRUD + search against spec-owned artifacts (the seeded ones are never mutated).

test("a created artifact appears, opens, trashes, and restores", async ({ page }) => {
    const id = await makeArtifact(page.request, "Zebra lifecycle doc", [
        sec("s1", colOf([txt("Zebra body content")])),
    ]);
    await page.goto("/");
    // the row menu, so the list layout: the grid card runs the same component from its own chrome
    await page.getByTitle("List", { exact: true }).click();
    const card = page.locator("section", { hasText: "Zebra lifecycle doc" }).first();
    await expect(card).toBeVisible();

    // trash from the card's actions menu (its toggle carries the Move-to-folder title)
    await card.hover();
    await card.getByTitle("Move to folder").click();
    await page.getByText("Delete", { exact: true }).first().click();
    // confirms are fine to click in e2e: the artifact is spec-owned
    const confirm = page.getByRole("button", { name: /trash|delete/i }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.locator("section", { hasText: "Zebra lifecycle doc" })).toHaveCount(0);

    await page.goto("/trash");
    await expect(page.getByText("Zebra lifecycle doc").first()).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).first().click();
    await page.goto("/");
    await expect(page.locator("section", { hasText: "Zebra lifecycle doc" }).first()).toBeVisible();
    // cleanup so reruns don't accumulate; API trash is enough
    await page.request.post(`/api/artifacts/${id}/trash`);
});

// The grid is the default and draws the same rows as cards, so what it has to prove is the part the
// list has no equivalent for: the carousel reaches the sections. The switch and its memory follow.
test("the grid layout carries a section carousel and remembers the switch", async ({ page }) => {
    // Its own multi-section artifact rather than whichever seeded card sorts first: a one-section
    // card disables its arrows, and a disabled arrow is pointer-events-none, so the hover never lands.
    const id = await makeArtifact(page.request, "Carousel fixture doc", [
        sec("s1", colOf([txt("Carousel page one")])),
        sec("s2", colOf([txt("Carousel page two")])),
        sec("s3", colOf([txt("Carousel page three")])),
    ]);
    await page.goto("/");
    await expect(page.locator("main section")).toHaveCount(0);

    // the title button's parent is the media box, which also holds the nav arrows and the counter
    const media = page.getByTitle("Carousel fixture doc").locator("..").first();
    await media.hover(); // the arrows are hover chrome
    const next = media.getByTitle("Next section");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(media.getByTestId("card-position")).toBeVisible();

    await page.getByTitle("List", { exact: true }).click();
    await expect(page.locator("main section").first()).toBeVisible();
    await page.reload();
    await expect(page.locator("main section").first()).toBeVisible();

    // the choice persists per device, so put it back: later specs read the library in its default
    // grid, where what is on screen (and so matchable) is not the same set of rows.
    await page.getByTitle("Grid", { exact: true }).click();
    await page.request.post(`/api/artifacts/${id}/trash`);
});

test("the search field finds seeded content", async ({ page }) => {
    await page.goto("/");
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill("Helios");
    await expect(page.getByText(/Helios/i).first()).toBeVisible();
});

test("the command palette opens with ⌘K and searches", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("Lumen");
    // the artifacts source answers from the server, so this waits on a round trip and an FTS query
    // over however many rows the run has accumulated, not on a local rank
    await expect(page.getByText(/Lumen/i).first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
});

// The access layer filters the library in SQL, so a plain member's list is a different query from an
// owner's. It has to come back non-empty: an empty library for someone who has access is the failure
// this pins, and it can only be seen through the real client, cookie and all.
test("a plain member's library renders the workspace's work", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: statePath("demo+invited") });
    const page = await ctx.newPage();
    await page.goto("/");
    // one draggable preview per artifact, in either layout
    const previews = page.locator('main [draggable="true"]');
    await expect(previews.first()).toBeVisible();
    expect(await previews.count()).toBeGreaterThan(0);
    await ctx.close();
});

test("the card's menu button stays put while its menu is open", async ({ page }) => {
    const id = await makeArtifact(page.request, "Menu anchor deck", [
        sec("s1", colOf([txt("Menu anchor body")])),
    ]);
    await page.goto("/");
    const media = page.getByTitle("Menu anchor deck").locator("..").first();
    const dots = media.getByTitle("Move to folder");

    // it is hover chrome, so it is not there until the pointer is
    await expect(dots).not.toBeVisible();
    await media.hover();
    await expect(dots).toBeVisible();

    // Opening it moves the pointer into a panel portalled to <body>, so the card's hover ends and a
    // mouse click does not match :focus-visible. Without care the button vanishes under its own menu.
    await dots.click();
    await expect(page.getByText("Duplicate", { exact: true })).toBeVisible();
    await expect(dots).toBeVisible();

    await page.request.post(`/api/artifacts/${id}/trash`);
});
