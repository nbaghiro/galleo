import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, statePath, test } from "@e2e/fixtures";

// The seeded personas ARE the role fixtures: each login's plus-tag names the role it demonstrates.
// Specs enter the flagship workspace explicitly, so a persona's default active workspace never
// decides what gets asserted.

const PASSWORD = "galleo-demo-2026";

async function enterWorkspace(request: APIRequestContext, name: string): Promise<void> {
    const res = await request.get("/api/workspace");
    const body = (await res.json()) as { memberships?: { id: string; name: string }[] };
    const target = body.memberships?.find((m) => m.name === name);
    if (!target) throw new Error(`no membership named "${name}"`);
    await request.post("/api/workspace/switch", { data: { workspaceId: target.id } });
}

async function personaPage(browser: Browser, persona: string): Promise<Page> {
    const ctx = await browser.newContext({ storageState: statePath(persona) });
    return ctx.newPage();
}

test("the owner sees full member management, with plus-addressed emails intact", async ({
    browser,
}) => {
    const page = await personaPage(browser, "demo");
    await enterWorkspace(page.request, "Premium Workspace");
    await page.goto("/settings/members");
    await expect(page.getByText("demo+admin@galleo.app")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect(page.getByTitle("Make workspace owner").first()).toBeVisible();
    await page.context().close();
});

test("an admin manages members but cannot transfer ownership", async ({ browser }) => {
    const page = await personaPage(browser, "demo+admin");
    await enterWorkspace(page.request, "Premium Workspace");
    await page.goto("/settings/members");
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect(page.getByTitle("Make workspace owner")).toHaveCount(0);
    await page.context().close();
});

test("a member gets no invite affordance", async ({ browser }) => {
    const page = await personaPage(browser, "demo+member");
    await enterWorkspace(page.request, "Premium Workspace");
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await page.context().close();
});

test("the pinned invite joins the invited account to the workspace", async ({ browser }) => {
    // fresh context: sign in as the invited persona THROUGH the invite link
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/invite/demo-demo+invited-demo");
    await page.getByPlaceholder("you@studio.com").fill("demo+invited@galleo.app");
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Join workspace" }).click();
    // joined: the flagship is now among the account's memberships
    await expect
        .poll(async () => {
            const res = await page.request.get("/api/workspace");
            const body = (await res.json()) as { memberships?: { name: string }[] };
            return body.memberships?.some((m) => m.name === "Premium Workspace") ?? false;
        })
        .toBe(true);
    await ctx.close();
});
