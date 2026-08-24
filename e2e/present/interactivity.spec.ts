import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@e2e/fixtures";
import { boxOf, makeArtifact, sec, txt, type El } from "@e2e/helpers";

// What a reader can do with a published continuous piece: open an accordion row, switch a tab, and
// follow a button's link. Viewer state is per session and never written back, so the spec asserts
// the toggles work and the stored content is untouched afterwards.

const ANSWER = "Nine formats, one engine, zero re-authoring.";
const PANEL_ONE = "The short version for a passing reader.";
const PANEL_TWO = "The long version for a reader who stayed.";

const faq: El = {
    type: "faq",
    data: {
        collapse: "collapsible",
        children: [txt("How many formats?", "h3"), txt(ANSWER)],
    },
};

const tabs: El = {
    type: "tabs",
    data: {
        labels: "Summary, Detail",
        active: 0,
        children: [txt(PANEL_ONE), txt(PANEL_TWO)],
    },
};

const cta: El = {
    type: "button",
    data: { label: "Read the docs", href: "https://galleo.app/docs" },
};

const PANEL_LINE = "The footnote a reader opens only when they want it.";
const PRICING = "https://galleo.app/pricing";

// stored open, which is what an export prints; a reader still starts with it shut
const popup: El = {
    type: "popup",
    data: {
        label: "Included",
        variant: "panel",
        open: true,
        children: [txt(PANEL_LINE)],
    },
};

const menu: El = {
    type: "popup",
    data: {
        label: "More",
        variant: "menu",
        children: [{ type: "button", data: { label: "Pricing", href: PRICING, variant: "ghost" } }],
    },
};

async function publish(request: APIRequestContext, id: string): Promise<string> {
    const res = await request.post(`/api/artifacts/${id}/links`, {
        data: { visibility: "public", name: "e2e interactivity" },
    });
    if (!res.ok()) throw new Error(`publish failed: ${res.status()}`);
    const body = (await res.json()) as { link?: { slug?: string } };
    const slug = body.link?.slug;
    if (!slug) throw new Error("published link carried no slug");
    return slug;
}

test("a published doc discloses, switches tabs, and links out, without writing back", async ({
    page,
    browser,
}) => {
    const id = await makeArtifact(
        page.request,
        "e2e interactivity",
        [sec("s1", faq), sec("s2", tabs), sec("s3", cta)],
        "doc",
    );
    const slug = await publish(page.request, id);

    const anon = await browser.newContext();
    const reader = await anon.newPage();
    await reader.goto(`/p/${slug}`);

    // the accordion starts shut, because that is what the author stored
    const question = reader.getByText("How many formats?").last();
    await expect(question).toBeVisible();
    await expect(reader.getByText(ANSWER)).toHaveCount(0);

    await question.click();
    await expect(reader.getByText(ANSWER).last()).toBeVisible();
    await question.click();
    await expect(reader.getByText(ANSWER)).toHaveCount(0);

    // tabs: the second panel is one press away, and the first goes back
    await expect(reader.getByText(PANEL_ONE).last()).toBeVisible();
    await reader.getByText("Detail", { exact: true }).last().click();
    await expect(reader.getByText(PANEL_TWO).last()).toBeVisible();
    await expect(reader.getByText(PANEL_ONE)).toHaveCount(0);
    await reader.getByText("Summary", { exact: true }).last().click();
    await expect(reader.getByText(PANEL_ONE).last()).toBeVisible();

    // the button paints as a real anchor that opens in a new tab
    const link = reader.locator('a[href="https://galleo.app/docs"]').first();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await boxOf(link);

    // none of it reached the document
    const stored = await page.request.get(`/api/artifacts/${id}`);
    const body = (await stored.json()) as {
        artifact: { draftContent: { sections: { root: { data: Record<string, unknown> } }[] } };
    };
    const sections = body.artifact.draftContent.sections;
    expect(sections[1]!.root.data.active).toBe(0);
    const answers = sections[0]!.root.data.children as { data: { open?: boolean } }[];
    expect(answers[1]!.data.open).toBeUndefined();

    await anon.close();
});

test("a published popup starts shut, floats its panel, and dismisses", async ({
    page,
    browser,
}) => {
    const id = await makeArtifact(
        page.request,
        "e2e popup",
        [sec("s1", popup), sec("s2", menu)],
        "doc",
    );
    const slug = await publish(page.request, id);

    const anon = await browser.newContext();
    const reader = await anon.newPage();
    await reader.goto(`/p/${slug}`);

    // the trigger paints in flow; the overlay over it is what a reader presses
    await expect(reader.getByText("Included").last()).toBeVisible();
    const triggers = reader.locator('[data-live="popup"] [role="button"]');
    const trigger = triggers.first();
    await expect(trigger).toBeVisible();
    // stored open, painted shut: playback never inherits the author's disclosure
    await expect(reader.getByText(PANEL_LINE)).toHaveCount(0);

    await trigger.click();
    await expect(reader.getByText(PANEL_LINE).last()).toBeVisible();
    await reader.keyboard.press("Escape");
    await expect(reader.getByText(PANEL_LINE)).toHaveCount(0);

    // pressing away from the panel dismisses it too
    await trigger.click();
    await expect(reader.getByText(PANEL_LINE).last()).toBeVisible();
    await reader.mouse.click(6, 6);
    await expect(reader.getByText(PANEL_LINE)).toHaveCount(0);

    // menu variant: its children are buttons, so they are real anchors in the portal
    await triggers.nth(1).click();
    const link = reader.locator(`a[href="${PRICING}"]`).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // and the stored default is exactly where the author left it
    const stored = await page.request.get(`/api/artifacts/${id}`);
    const body = (await stored.json()) as {
        artifact: { draftContent: { sections: { root: { data: Record<string, unknown> } }[] } };
    };
    expect(body.artifact.draftContent.sections[0]!.root.data.open).toBe(true);

    await anon.close();
});
