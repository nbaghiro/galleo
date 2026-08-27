import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// Commenting is interaction-only chrome (a chip on the selection, a marker in the section's border
// revealed on hover, a floating thread), so the browser is the only place the whole path can be
// exercised. There is no rail: a marker is reachable by hovering the section it belongs to.

// The reveal follows the section's band across the whole stack width, so a point is enough and does
// not depend on which element still carries which text after an edit.
const stageOf = (page: Page): Locator => page.locator("main > div").first();

async function hoverStack(page: Page, at: "inside" | "outside"): Promise<void> {
    const box = (await stageOf(page).boundingBox())!;
    if (at === "inside") await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.move(box.x + box.width / 2, Math.max(2, box.y - 24));
}

test("an element comment posts, marks the section border on hover, and reopens", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e comments", [
        sec("s1", colOf([txt("Commentable headline", "h2"), txt("Another line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const headline = paintedText(page, "Commentable headline");
    await headline.click();
    await page.keyboard.press("Escape"); // leave the text edit session, keep the selection

    const chip = page.getByTitle("Comment on this");
    await expect(chip).toBeVisible();
    await chip.click();

    await page.getByPlaceholder("Leave a comment").fill("Tighten this headline");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Tighten this headline")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Reply")).toHaveCount(0); // the thread closed with it
    const marker = page.getByRole("button", { name: /Tighten this headline/ });

    // The marker also rides the selection chrome, so clear the selection first: what this asserts is
    // the canvas margin, where a marker is hover chrome and nothing should remain with the pointer off.
    await page.keyboard.press("Escape");
    await hoverStack(page, "outside");
    await expect(marker).toHaveCount(0);

    // hovering the section reveals it, and it stays put long enough to be clicked
    await headline.hover();
    await expect(marker).toBeVisible();
    await marker.click();
    await expect(page.getByPlaceholder("Reply")).toBeVisible();

    // an open thread holds its section revealed, so the marker never vanishes under the panel
    await hoverStack(page, "outside");
    await expect(marker).toBeVisible();
});

test("a text-range comment keeps its quote and survives a later edit", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e text comments", [
        sec("s1", colOf([txt("Alpha beta gamma delta"), txt("Second line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const target = paintedText(page, "Alpha beta gamma delta");
    await target.click();
    // a double click selects a word inside the live contenteditable
    await page.getByTestId("text-editor").dblclick({ position: { x: 60, y: 8 } });

    await page.getByTitle("Comment on this").click();
    await page.getByPlaceholder("Leave a comment").fill("This word is wrong");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("This word is wrong")).toBeVisible();

    // the mark is invisible to the DOM, so it has to ride the splice a later keystroke makes
    await page.keyboard.press("Escape");
    await target.click();
    await page.keyboard.type("!");
    await page.keyboard.press("Escape");
    await hoverStack(page, "inside");
    await expect(page.getByRole("button", { name: /This word is wrong/ })).toBeVisible();

    const listed = await (await page.request.get(`/api/artifacts/${id}/comments`)).json();
    expect(listed.comments[0].anchor.kind).toBe("text");
    expect(listed.comments[0].quote.length).toBeGreaterThan(0);
});

// Nothing may become unreachable just because its element is gone.
test("threads whose element was deleted collect into the section's stack", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e orphans", [
        sec("s1", colOf([txt("Doomed headline", "h2"), txt("Surviving line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const doomed = paintedText(page, "Doomed headline");
    await doomed.click();
    await page.keyboard.press("Escape");
    await page.getByTitle("Comment on this").click();
    await page.getByPlaceholder("Leave a comment").fill("Note on the doomed line");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Note on the doomed line")).toBeVisible();
    await page.keyboard.press("Escape");

    // delete the element the thread pointed at
    await doomed.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Delete");
    await expect(paintedText(page, "Doomed headline")).toHaveCount(0);

    await hoverStack(page, "inside");
    const stack = page.getByTestId("orphan-stack");
    await expect(stack).toBeVisible();
    await stack.click();
    await expect(page.getByText("On removed content")).toBeVisible();
    await expect(page.getByText("Note on the doomed line")).toBeVisible();

    // and opening one from the stack gives it a thread to read and reply in
    await page.getByText("Note on the doomed line").click();
    await expect(page.getByPlaceholder("Reply")).toBeVisible();
});

// A panel is a popover against whatever opened it. Anchoring the composer to the section's border
// instead put it across the canvas from the element being commented on, over the docked inspector.
test("the new-comment composer opens beside the element, not at the section edge", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e composer anchor", [
        sec("s1", colOf([txt("Anchor me", "h2"), txt("Another line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const target = paintedText(page, "Anchor me");
    await target.click();
    await page.keyboard.press("Escape");

    const chip = page.getByTitle("Comment on this");
    const chipBox = (await chip.boundingBox())!;
    await chip.click();

    const composer = page.getByPlaceholder("Leave a comment");
    await expect(composer).toBeVisible();
    const panel = (await composer.locator("xpath=ancestor::div[1]").boundingBox())!;
    const stage = (await stageOf(page).boundingBox())!;

    // beside the chip, top-aligned with it, and inside the stage rather than out in the gutter
    expect(Math.abs(panel.y - chipBox.y)).toBeLessThan(40);
    const gap =
        panel.x >= chipBox.x
            ? panel.x - (chipBox.x + chipBox.width)
            : chipBox.x - (panel.x + panel.width);
    expect(gap).toBeLessThan(40);
    expect(panel.x + panel.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
});

// Outside dismissal, both surfaces. Nothing is swallowed: the same press still does its own job.
test("a press outside the thread popover closes it, and still lands where it was aimed", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e dismiss thread", [
        sec("s1", colOf([txt("Dismiss head", "h2"), txt("Dismiss body")])),
    ]);
    await page.goto(`/edit/${id}`);
    const head = paintedText(page, "Dismiss head");
    await head.click();
    await page.keyboard.press("Escape");
    await page.getByTitle("Comment on this").click();
    await page.getByPlaceholder("Leave a comment").fill("Close me");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Close me")).toBeVisible();
    await page.keyboard.press("Escape");

    await head.hover();
    await page.getByRole("button", { name: /Close me/ }).click();
    await expect(page.getByPlaceholder("Reply")).toBeVisible();

    // a press on another element closes the thread and still selects that element: nothing is
    // swallowed. Aimed at its left edge, since the panel sits in the margin on the other side.
    await paintedText(page, "Dismiss body").click({ position: { x: 6, y: 6 } });
    await expect(page.getByPlaceholder("Reply")).toHaveCount(0);
    await expect(page.getByTestId("text-editor")).toBeVisible();
});

// Resolving used to leave a dimmed marker sitting exactly where it was, which read as nothing
// happening. It is an event now: the thread goes, and the section's chip is what holds the archive.
async function leaveComment(page: Page, on: Locator, body: string): Promise<void> {
    await on.click();
    await page.keyboard.press("Escape");
    await page.getByTitle("Comment on this").click();
    await page.getByPlaceholder("Leave a comment").fill(body);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText(body)).toBeVisible();
}

test("a resolved thread stays where it was, marked rather than hidden", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e resolve", [
        sec("s1", colOf([txt("Resolve me headline", "h2"), txt("Another line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const head = paintedText(page, "Resolve me headline");
    await leaveComment(page, head, "Resolve this one");

    await page.getByTestId("comment-thread").getByTitle("Resolve this thread").click();

    // the panel closes and a line says what happened
    await expect(page.getByPlaceholder("Reply")).toHaveCount(0);
    await expect(page.getByTestId("collab-notice")).toContainText("Thread resolved");

    // the marker keeps its place beside the element it was left on, and says it is resolved rather
    // than retreating into a per-section archive the reader has to know to open
    await head.hover();
    const marker = page.getByRole("button", { name: /Resolve this one/ });
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute("title", /^Resolved\./);

    // and it still opens, which is what makes it the way back
    await marker.click();
    await expect(page.getByText("Resolve this one")).toBeVisible();
    await expect(page.getByPlaceholder("Reply")).toBeVisible();
});

test("the resolve notice reopens the thread it just closed", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e resolve undo", [
        sec("s1", colOf([txt("Undo me headline", "h2"), txt("Another line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const head = paintedText(page, "Undo me headline");
    await leaveComment(page, head, "Undo this resolve");

    await page.getByTestId("comment-thread").getByTitle("Resolve this thread").click();
    await page.getByRole("button", { name: "Reopen" }).click();

    // back where it was: the thread is open again and its marker no longer reads as resolved
    await expect(page.getByPlaceholder("Reply")).toBeVisible();
    await page.keyboard.press("Escape");
    await head.hover();
    const marker = page.getByRole("button", { name: /Undo this resolve/ });
    await expect(marker).toBeVisible();
    await expect(marker).not.toHaveAttribute("title", /^Resolved\./);
});

// The regression this pins: the overflow menu portals out of the panel, so its item was read as an
// outside press. The panel closed on pointerdown, the item left the DOM, and the click never ran.
test("delete thread from the overflow menu removes it, and it stays gone", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e delete thread", [
        sec("s1", colOf([txt("Delete me headline", "h2"), txt("Another line")])),
    ]);
    await page.goto(`/edit/${id}`);
    const head = paintedText(page, "Delete me headline");
    await head.click();
    await page.keyboard.press("Escape");
    await page.getByTitle("Comment on this").click();
    await page.getByPlaceholder("Leave a comment").fill("Delete this thread");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Delete this thread")).toBeVisible();

    await page.getByTestId("comment-thread").getByTitle("More").click();
    await page.getByRole("menuitem", { name: "Delete thread" }).click();
    await expect(page.getByPlaceholder("Reply")).toHaveCount(0);

    await page.reload();
    await hoverStack(page, "inside");
    await expect(page.getByRole("button", { name: /Delete this thread/ })).toHaveCount(0);
    const listed = await (await page.request.get(`/api/artifacts/${id}/comments`)).json();
    expect(listed.comments).toEqual([]);
});

test("the rail flyout closes on a press outside it, and the inspector still auto-opens", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e dismiss flyout", [
        sec("s1", colOf([txt("Flyout head", "h2"), txt("Flyout body")])),
    ]);
    await page.goto(`/edit/${id}`);

    const palette = page.getByPlaceholder("Search elements…");
    await page.getByTitle("Search").click();
    await expect(palette).toBeVisible();

    // pressing the rail again is not an outside press
    await page.getByTitle("Search").click();
    await expect(palette).toHaveCount(0);

    // empty canvas closes it
    await page.getByTitle("Search").click();
    await expect(palette).toBeVisible();
    await page.mouse.click(700, 620);
    await expect(palette).toHaveCount(0);

    // and a press that selects a panel-worthy element hands the flyout to the inspector instead
    await page.getByTitle("Search").click();
    await expect(palette).toBeVisible();
    await paintedText(page, "Flyout head").click();
    await expect(palette).toHaveCount(0);
    await expect(page.locator("aside")).toBeVisible();
});

// Same rule as the thread menu above, one surface over: a dropdown opened inside the docked
// inspector portals to the body, and the flyout has to read that press as its own.
test("an inspector dropdown applies its option and leaves the flyout open", async ({ page }) => {
    const id = await makeArtifact(page.request, "e2e inspector dropdown", [
        sec(
            "s1",
            colOf([
                txt("Loose line", "h3"),
                { type: "callout", data: { tone: "note", children: [txt("Callout body")] } },
            ]),
        ),
    ]);
    await page.goto(`/edit/${id}`);
    // a callout is framed rather than edited in place, so selecting it opens the docked inspector
    await paintedText(page, "Callout body").click();
    await page.keyboard.press("Escape"); // out of the text session, onto the line
    await page.keyboard.press("Escape"); // up to the callout that frames it
    const flyout = page.getByTestId("right-flyout");
    await expect(flyout).toContainText("Callout");

    await flyout.getByRole("button", { name: "Note", exact: true }).click();
    await page.getByRole("button", { name: "Warning", exact: true }).click();

    await expect(flyout).toBeVisible();
    await expect(flyout.getByRole("button", { name: "Warning", exact: true })).toBeVisible();
});

// The screenshot case: inline-editing a cell inside a composite floated the chip over the cell,
// covering the content it pointed at. A part of a block is not commentable; the block is.
test("no comment chip on a part of a composite, and one on the composite itself", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "e2e composite comments", [
        sec(
            "s1",
            colOf([
                txt("Loose line", "h3"),
                {
                    type: "container",
                    data: {
                        surface: "solid",
                        children: [txt("Card headline", "h3"), txt("Card body copy")],
                    },
                },
            ]),
        ),
    ]);
    await page.goto(`/edit/${id}`);
    const chip = page.getByTitle("Comment on this");

    // a loose block offers the chip
    await paintedText(page, "Loose line").click();
    await page.keyboard.press("Escape");
    await expect(chip).toBeVisible();

    // a line inside the card does not, selected or inline-editing
    await paintedText(page, "Card headline").click();
    await expect(chip).toHaveCount(0);
    await expect(page.getByTestId("text-editor")).toBeVisible();
    await expect(chip).toHaveCount(0);

    // walking up to the card itself brings it back: the comment belongs to the block
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(chip).toBeVisible();
});
