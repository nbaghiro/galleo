import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Present-mode navigation and real export bytes.

test("present mode walks the deck with the keyboard and Escape leaves", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e present", [
        sec("s1", colOf([txt("Slide one headline", "h1")])),
        sec("s2", colOf([txt("Slide two headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(page.getByText("Slide one headline").first()).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Slide two headline").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/edit\//);
});

test("export produces a real PDF", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e export", [
        sec("s1", colOf([txt("Exported content headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const downloadP = page.waitForEvent("download", { timeout: 60_000 });
    // the modal's per-destination CTA, which builds the export if the preview was never requested
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const download = await downloadP;
    const stream = await download.createReadStream();
    const first = await new Promise<Buffer>((resolve, reject) => {
        stream.once("data", (chunk: Buffer) => resolve(chunk));
        stream.once("error", reject);
    });
    expect(first.subarray(0, 4).toString()).toBe("%PDF");
});
