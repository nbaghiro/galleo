import type { APIRequestContext } from "@playwright/test";
import { expect, statePath, test } from "@e2e/fixtures";

// The one spec that moves the demo login off the flagship workspace. `users.activeWorkspaceId` is a
// single server-side pointer per person, not a per-browser one, so for as long as this runs every
// other context signed in as demo reads the free plan too: a publish 402s, an artifact create 402s,
// and the library is a different library. That is why it sits in its own project which every
// project sharing that login depends on (playwright.config.ts), rather than beside the role tests
// it used to live with. The switch back is in a finally, so a failed assertion here cannot strand
// the rest of the run on the free plan either.

const FLAGSHIP = "Premium Workspace";

async function enterWorkspace(request: APIRequestContext, name: string): Promise<void> {
    const res = await request.get("/api/workspace");
    const body = (await res.json()) as { memberships?: { id: string; name: string }[] };
    const target = body.memberships?.find((m) => m.name === name);
    if (!target) throw new Error(`no membership named "${name}"`);
    await request.post("/api/workspace/switch", { data: { workspaceId: target.id } });
}

test("the free plan blocks invites past its seat cap", async ({ browser }) => {
    // the demo login owns the Free workspace: one seat, already taken by them
    const ctx = await browser.newContext({ storageState: statePath("demo") });
    const page = await ctx.newPage();
    try {
        await enterWorkspace(page.request, "Free Workspace");
        await page.goto("/settings");
        const invite = page.getByRole("button", { name: "Invite" });
        // either the affordance is gated up front, or the attempt is refused with an upsell
        if (await invite.isVisible()) {
            await page.getByPlaceholder(/teammate/i).fill("overflow@example.com");
            await invite.click();
            await expect(page.getByText(/seat|upgrade|plan/i).first()).toBeVisible();
        } else {
            await expect(page.getByText(/seat|upgrade|add seats/i).first()).toBeVisible();
        }
    } finally {
        await enterWorkspace(page.request, FLAGSHIP);
        await ctx.close();
    }
});
