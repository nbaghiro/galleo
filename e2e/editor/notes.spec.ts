import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Speaker notes are a view mode, not a job: turning them on is the whole request. The script is
// content, so it saves through the ordinary section-op path and is stripped at the publish boundary.

test("the notes strip opens from the section rail and edits save", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e notes", [
        sec("s1", colOf([txt("Notable headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);

    await page.getByTitle("Speaker notes and narration").first().click();

    const script = page.getByPlaceholder("What you would say over this section.");
    await expect(script).toBeVisible();
    await script.fill("Open by naming the problem, then give the number.");

    // the autosave debounce has to land before the reload, so wait on the write itself
    await page.waitForResponse(
        (r) => r.url().includes(`/artifacts/${id}/content`) && r.request().method() === "PATCH",
    );

    await page.reload();
    await page.getByTitle("Speaker notes and narration").first().click();
    await expect(page.getByPlaceholder("What you would say over this section.")).toHaveValue(
        "Open by naming the problem, then give the number.",
    );
});

test("the strip closes again, and the toggle is not in the header bar", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e notes toggle", [
        sec("s1", colOf([txt("A headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);

    const script = page.getByPlaceholder("What you would say over this section.");
    await expect(script).toBeHidden();
    await page.getByTitle("Speaker notes and narration").first().click();
    await expect(script).toBeVisible();
    await page.getByTitle("Hide speaker notes").first().click();
    await expect(script).toBeHidden();
});
