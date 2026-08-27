import { expect, test } from "@e2e/fixtures";
import { colOf, makeArtifact, sec, txt } from "@e2e/helpers";

// The library lists from `format_id` / `theme_id`; the editor renders from `draft_content`. A shell
// change travels as a collab op, and the room applies its ops with no shell of its own, so nothing
// used to move the columns: a deck switched to a site kept saying DECK in the library forever while
// opening as a site. The columns are derived from the content now, and this is what proves it,
// because nothing below the socket is visible from a unit test.
test("a format switch moves the column the library reads, not just the content", async ({
    page,
}) => {
    const id = await makeArtifact(page.request, "Shell column probe", [
        sec("s1", colOf([txt("A headline that is long enough to matter here")])),
        sec("s2", colOf([txt("A second section with its own body copy")])),
    ]);
    await page.goto(`/edit/${id}`);
    const site = page.getByRole("button", { name: "Site" }).first();
    await expect(site).toBeVisible();

    const read = async (): Promise<{ formatId: string; format: string }> => {
        const body = await (await page.request.get(`/api/artifacts/${id}`)).json();
        return {
            formatId: body.artifact.formatId as string,
            format: body.artifact.draftContent.format as string,
        };
    };
    expect(await read()).toEqual({ formatId: "deck", format: "deck" });

    await site.click();
    // the switch persists over the room's socket, so there is no request to await
    await expect.poll(read, { timeout: 10000 }).toEqual({ formatId: "web", format: "web" });

    await page.request.post(`/api/artifacts/${id}/trash`);
});
