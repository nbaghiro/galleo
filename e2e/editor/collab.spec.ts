import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, statePath, test } from "@e2e/fixtures";
import { colOf, makeArtifact, paintedText, sec, txt } from "@e2e/helpers";

// Live collaboration is two browsers or nothing: the roster, the remote cursor, and the edit lease
// only exist between them. Both personas enter the same seeded workspace so the artifact one makes
// is one the other can open.

const FLAGSHIP = "Northwind Studio";

async function enterWorkspace(request: APIRequestContext, name: string): Promise<void> {
    const body = (await (await request.get("/api/workspace")).json()) as {
        memberships?: { id: string; name: string }[];
    };
    const target = body.memberships?.find((m) => m.name === name);
    if (!target) throw new Error(`no membership named "${name}"`);
    await request.post("/api/workspace/switch", { data: { workspaceId: target.id } });
}

async function personaPage(browser: Browser, persona: string): Promise<Page> {
    const ctx = await browser.newContext({ storageState: statePath(persona) });
    const page = await ctx.newPage();
    await enterWorkspace(page.request, FLAGSHIP);
    return page;
}

test("two people in one artifact see each other, each other's cursor, and each other's edits", async ({
    browser,
}) => {
    const owner = await personaPage(browser, "demo");
    const guest = await personaPage(browser, "demo+member");

    const id = await makeArtifact(owner.request, "e2e collab", [
        sec("s1", colOf([txt("Shared headline", "h2"), txt("Second line")])),
    ]);

    await owner.goto(`/edit/${id}`);
    await guest.goto(`/edit/${id}`);

    // the roster: each side shows the other, and never itself
    await expect(owner.getByTitle(/is here$/)).toHaveCount(1);
    await expect(guest.getByTitle(/is here$/)).toHaveCount(1);

    // A cursor: the owner moves over content, the guest paints it from its own engine output. The
    // moves stay over painted elements on purpose, since a pointer off content sends no cursor.
    const headline = paintedText(owner, "Shared headline");
    await paintedText(owner, "Second line").hover();
    await headline.hover();
    await expect(guest.getByTestId("peer-cursor")).toHaveCount(1);

    // an edit: what the owner types lands in the guest's canvas without a reload
    await headline.click();
    await owner.keyboard.type(" edited");
    await owner.keyboard.press("Escape");
    await expect(paintedText(guest, "Shared headline edited")).toBeVisible();

    await owner.context().close();
    await guest.context().close();
});

test("an element someone is typing in cannot be entered by anyone else", async ({ browser }) => {
    const owner = await personaPage(browser, "demo");
    const guest = await personaPage(browser, "demo+member");

    const id = await makeArtifact(owner.request, "e2e collab lease", [
        sec("s1", colOf([txt("Held headline", "h2"), txt("Free line")])),
    ]);
    await owner.goto(`/edit/${id}`);
    await guest.goto(`/edit/${id}`);
    await expect(guest.getByTitle(/is here$/)).toHaveCount(1);

    // the owner holds the headline
    await paintedText(owner, "Held headline").click();
    await expect(owner.getByTestId("text-editor")).toBeVisible();

    // the guest sees the hold, and clicking it says who is in there rather than opening an editor
    await expect(guest.getByTestId("peer-editing")).toHaveCount(1);
    await paintedText(guest, "Held headline").click();
    await expect(guest.getByTestId("collab-notice")).toBeVisible();
    await expect(guest.getByTestId("text-editor")).toHaveCount(0);

    // the element beside it is still free to work in. Esc walks the selection up and out first, so
    // the blocked element's floating toolbar is not sitting over the one being clicked next.
    for (let i = 0; i < 4; i++) await guest.keyboard.press("Escape");
    await expect(guest.locator("[data-galleo-toolbar]")).toHaveCount(0);
    await paintedText(guest, "Free line").click();
    await expect(guest.getByTestId("text-editor")).toBeVisible();

    await owner.context().close();
    await guest.context().close();
});
