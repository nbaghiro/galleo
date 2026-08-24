import type { Page } from "@playwright/test";
import { expect, test } from "@e2e/fixtures";

// The path an external MCP client sends a person down: /oauth/authorize arrives in a cold browser
// with no app loaded, and if there is no Galleo session it has to park them somewhere that can sign
// them in and then carry them back. Signed out, `/` serves the marketing site, which knows nothing
// about where they were going, so landing there strands the desktop client that sent them.

const authorizeUrl = (clientId: string): string =>
    `/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        "http://localhost:33418/cb",
    )}&code_challenge=abc123&code_challenge_method=S256`;

async function registerClient(page: Page): Promise<string> {
    const res = await page.request.post("/oauth/register", {
        data: { client_name: "e2e connect", redirect_uris: ["http://localhost:33418/cb"] },
    });
    return ((await res.json()) as { client_id: string }).client_id;
}

test("a signed-out authorize lands on the app's sign-in, keeping where it was going", async ({
    page,
}) => {
    const clientId = await registerClient(page);
    await page.context().clearCookies();
    await page.goto(authorizeUrl(clientId));

    // the app shell, not the marketing site: its auth gate is what can sign this person in
    await expect(page.locator("#root")).toBeAttached();
    await expect(page).toHaveURL(/\/connect\?next=/);

    // and the destination survives in the url, which is what carries them back afterwards
    const next = new URL(page.url()).searchParams.get("next") ?? "";
    expect(decodeURIComponent(next)).toContain("/oauth/authorize");
    expect(decodeURIComponent(next)).toContain(clientId);
});

test("signing in from there carries them on to consent", async ({ page }) => {
    const clientId = await registerClient(page);
    await page.context().clearCookies();
    await page.goto(authorizeUrl(clientId));
    await expect(page).toHaveURL(/\/connect\?next=/);

    await page.getByPlaceholder("you@studio.com").fill("demo@galleo.app");
    await page.getByPlaceholder("••••••••").first().fill("galleo-demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();

    // the whole point: back where the client sent them, not dropped on the library
    await expect(page.getByRole("button", { name: /allow access/i })).toBeVisible({
        timeout: 15_000,
    });
});
