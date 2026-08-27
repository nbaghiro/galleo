import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// Narration is only offered where it is configured. Without an ELEVENLABS_API_KEY the play control
// is absent rather than dead, which is the same rule the dictation mic already follows.

test("present mode offers no play control when nothing is prepared", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e narration", [
        sec("s1", colOf([txt("First headline", "h1")])),
        sec("s2", colOf([txt("Second headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(page.getByText("First headline").first()).toBeVisible();
    await expect(page.getByTitle(/Play/)).toHaveCount(0);
    // the overview grid moved into the shared surface with the convergence, so it works here now
    await page.keyboard.press("o");
    await expect(page.getByText("Second headline").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/edit\//);
});

// waits on the editor-side notes strip, which is not built yet (see e2e/editor/notes.spec.ts)
test.fixme("the notes pane shows a section's script to the presenter", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e present notes", [
        sec("s1", colOf([txt("Spoken over headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByText("Spoken over headline").first().click();
    await page.getByTitle("Speaker notes and narration").first().click();
    await page
        .getByPlaceholder("What you would say over this section.")
        .fill("This is what I would say.");
    await page.waitForResponse(
        (r) => r.url().includes(`/artifacts/${id}/content`) && r.request().method() === "PATCH",
    );

    await page.getByRole("button", { name: "Present", exact: true }).click();
    await page.keyboard.press("n");
    await expect(page.getByText("This is what I would say.")).toBeVisible();

    // the pane must not bury the bar beneath it: its own close button and the surface's controls
    // both have to stay reachable, which a z-index regression would break
    await expect(page.getByTitle("Close notes (N)")).toBeVisible();
    await expect(page.getByTitle("Exit (Esc)")).toBeVisible();
    await page.getByTitle("Close notes (N)").click();
    await expect(page.getByText("This is what I would say.")).toBeHidden();

    // and Escape closes the pane before it closes the whole surface
    await page.keyboard.press("n");
    await expect(page.getByText("This is what I would say.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("This is what I would say.")).toBeHidden();
    await expect(page).toHaveURL(/\/edit\//);
});

// Narration is one control until it runs. Captions only appear once there is something to caption,
// and the presenter's notes pane has no button on the bar any more.
test("the present bar shows narration as a single control", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e present bar", [
        sec("s1", colOf([txt("Bar headline", "h1")])),
    ]);
    await page.goto(`/edit/${id}`);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(page.getByText("Bar headline").first()).toBeVisible();

    // nothing to say on this deck, so no narration control at all, and never a notes button
    await expect(page.getByTitle(/^Play with voice/)).toHaveCount(0);
    await expect(page.getByTitle("Captions (C)")).toHaveCount(0);
    await expect(page.getByTitle("Speaker notes (N)")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/edit\//);
});
