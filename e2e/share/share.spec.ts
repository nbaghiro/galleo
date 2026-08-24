import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Publish links end to end against the seeded pinned slugs plus spec-owned links.

test("a public seeded link serves logged out; a private one does not", async ({ browser }) => {
    const ctx = await browser.newContext(); // logged out
    const page = await ctx.newPage();
    await page.goto("/p/lumen-launch");
    await expect(page.getByText(/Lumen/i).first()).toBeVisible();
    await page.goto("/p/helios-q3");
    await expect(page.getByText(/isn’t available|isn't available/).first()).toBeVisible();
    await ctx.close();
});

test("a protected seeded link wants its password, then renders", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/p/terra-preview");
    const pw = page.locator('input[type="password"]');
    await expect(pw).toBeVisible();
    await pw.fill("not-the-password");
    await page.getByRole("button", { name: /^View/ }).click();
    await expect(page.getByText(/password|protected/i).first()).toBeVisible();
    // the seed pins the protected password (see seed/workspaces.ts LinkSpec)
    await pw.fill("terra");
    await page.getByRole("button", { name: /^View/ }).click();
    await expect(page.getByText(/Terra/i).first()).toBeVisible();
    await ctx.close();
});

test("share creates a public link and revoking kills it", async ({ page, browser }) => {
    const id = await makeArtifact(page.request, "e2e share", [
        sec("s1", colOf([txt("Shareable masterpiece headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByText("Public", { exact: true }).click();
    await page.getByRole("button", { name: /^Create link/ }).click();
    // the modal shows the URL only behind Copy buttons; read the created slug through the API
    let slug = "";
    await expect
        .poll(async () => {
            const res = await page.request.get(`/api/artifacts/${id}/links`);
            const body = (await res.json()) as { links?: { slug?: string; url?: string }[] };
            const l = body.links?.[0];
            slug = l?.slug ?? l?.url?.match(/\/p\/([\w-]+)/)?.[1] ?? "";
            return slug;
        })
        .not.toBe("");

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/p/${slug}`);
    await expect(anonPage.getByText("Shareable masterpiece headline").first()).toBeVisible();

    // Manage expands the link row; deleting kills the URL
    await page.getByTitle("Manage").first().click();
    await page.getByTitle(/Delete this link/).click();
    // deletion committed server-side before the public URL is asserted dead
    await expect
        .poll(async () => {
            const res = await page.request.get(`/api/artifacts/${id}/links`);
            const body = (await res.json()) as { links?: unknown[] };
            return body.links?.length ?? 0;
        })
        .toBe(0);
    await expect(async () => {
        await anonPage.reload();
        await expect(anonPage.getByText(/isn’t available|isn't available/).first()).toBeVisible({
            timeout: 2000,
        });
    }).toPass({ timeout: 15_000 });
    await anon.close();
});
