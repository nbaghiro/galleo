import { expect, statePath, test } from "@e2e/fixtures";

// The four canaries: server up, auth path works, the editor paints, publishing serves. Everything
// deeper belongs to the per-area projects.

test("the server is healthy and the logged-out shell renders", async ({ page, request }) => {
    expect(await (await request.get("/health")).json()).toEqual({ ok: true });
    await page.goto("/templates"); // any app path logged out lands on the auth gate
    await expect(page.getByPlaceholder("you@studio.com")).toBeVisible();
});

test("demo signs in through the form and lands in the seeded library", async ({ page }) => {
    await page.goto("/templates");
    await page.getByPlaceholder("you@studio.com").fill("demo@galleo.app");
    await page.locator('input[type="password"]').fill("galleo-demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    // the flagship seeded workspace is the active one for demo
    await expect(page.getByText("Premium Workspace").first()).toBeVisible();
});

test.describe(() => {
    test.use({ storageState: statePath("demo") });

    test("a seeded artifact opens in the editor and paints", async ({ page }) => {
        await page.goto("/");
        // a click on the card's preview opens the editor (the title column is rename/etc.); the
        // preview carries the artifact's title in either layout
        await page.getByTitle("Galleo — Seed deck", { exact: true }).first().click();
        await expect(page).toHaveURL(/\/edit\//);
        // painted canvas text proves compose → engine → paint ran end to end
        await expect(page.getByText("Galleo", { exact: false }).first()).toBeVisible();
    });
});

test("a published link renders logged out with no editor chrome", async ({ page }) => {
    // lumen-launch is the seeded PUBLIC link (helios-q3 is recipient-gated by design)
    await page.goto("/p/lumen-launch");
    await expect(page.getByText(/Lumen/i).first()).toBeVisible();
    await expect(page.getByPlaceholder("you@studio.com")).toHaveCount(0);
});
