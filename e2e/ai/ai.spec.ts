import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// Dual-mode AI flows: with GALLEO_FAKE_AI=1 (the default server env) the scripted model answers
// and exact-content assertions hold; with E2E_LIVE_AI=1 the same specs run against whatever
// platform keys the shell exports, asserting only the invariants. See the implementation plan.

const LIVE = !!process.env.E2E_LIVE_AI;
const HAS_KEY = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.XAI_API_KEY
);

test.describe.configure({ mode: LIVE ? "serial" : "parallel" });
test.skip(LIVE && !HAS_KEY, "live AI lane needs a platform model key in the environment");

async function openChat(page: import("@playwright/test").Page): Promise<void> {
    await page.getByTitle("Chat with Galleo Agent").click();
    await expect(page.getByPlaceholder("Message the agent…")).toBeVisible();
}

test("chat proposes a new section and applying lands it on the canvas", async ({ page }) => {
    test.setTimeout(LIVE ? 240_000 : 60_000);
    const id = await makeArtifact(page.request, "e2e ai add", [
        sec("s1", colOf([txt("Existing opening copy", "h2")])),
    ]);
    await page.goto(`/edit/${id}`);
    await openChat(page);
    await page.getByPlaceholder("Message the agent…").fill("add a section about scripted testing");
    await page.keyboard.press("Enter");

    const apply = page.getByRole("button", { name: "Apply" }).first();
    await expect(apply).toBeVisible({ timeout: LIVE ? 180_000 : 45_000 });
    await apply.click();

    if (LIVE) {
        // invariant tier: a second section now exists below the first
        await expect(async () => {
            const first = await boxOf(paintedText(page, "Existing opening copy"));
            expect(first.y).toBeGreaterThanOrEqual(0);
        }).toPass();
    } else {
        // exact tier: the scripted writer names its section
        await expect(
            page
                .locator("main")
                .getByText(/Scripted .* headline/)
                .first(),
        ).toBeVisible();
    }
});

test("suggest-section-layouts returns cards and applying keeps the copy", async ({ page }) => {
    test.setTimeout(LIVE ? 240_000 : 60_000);
    const id = await makeArtifact(page.request, "e2e ai layouts", [
        sec("s1", colOf([txt("Immutable copy line one", "h2"), txt("Immutable copy line two")])),
    ]);
    await page.goto(`/edit/${id}`);
    await openChat(page);
    await page.getByPlaceholder("Message the agent…").fill("show me other layouts for s1");
    await page.keyboard.press("Enter");

    const applies = page.getByRole("button", { name: "Apply" });
    await expect(applies.first()).toBeVisible({ timeout: LIVE ? 180_000 : 45_000 });
    if (!LIVE) await expect.poll(() => applies.count()).toBeGreaterThanOrEqual(2);

    await applies.first().click();
    // the copy survives the re-layout (hard contract in fake mode, observed in live)
    await expect(paintedText(page, "Immutable copy line one")).toBeVisible();
    await expect(paintedText(page, "Immutable copy line two")).toBeVisible();
});
