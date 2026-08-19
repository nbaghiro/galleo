import { expect, statePath, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Library CRUD + search against spec-owned artifacts (the seeded ones are never mutated).

test("a created artifact appears, opens, trashes, and restores", async ({ page }) => {
    const id = await makeArtifact(page.request, "Zebra lifecycle doc", [
        sec("s1", colOf([txt("Zebra body content")])),
    ]);
    await page.goto("/");
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
    await expect(page.getByText(/Lumen/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
});

// The access layer filters the library in SQL, so a plain member's list is a different query from an
// owner's. It has to come back non-empty: an empty library for someone who has access is the failure
// this pins, and it can only be seen through the real client, cookie and all.
test("a plain member's library renders the workspace's work", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: statePath("demo+invited") });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("section").first()).toBeVisible();
    const listed = await page.locator("section").count();
    expect(listed).toBeGreaterThan(0);
    await ctx.close();
});
