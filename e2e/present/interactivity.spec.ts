import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@e2e/fixtures";
import { boxOf, colOf, makeArtifact, rowOf, sec, txt, type El } from "@e2e/helpers";

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

// stored open, which is what the editor shows; an export prints the trigger alone
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
    // stored open, and the panel is still nowhere in the flow: no surface paints it there
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

// A site's own navigation: `#id` hrefs move within the piece instead of leaving it, the pinned band
// stays put while they do, and the offset the scroll takes keeps the band off the target's first line.
const BRAND = "E2E SITE";
const LANDED = "The section a nav link lands on.";
const RECAP = "https://galleo.app/recap";

const siteNav: El = rowOf([
    txt(BRAND, "label"),
    { type: "button", data: { label: "Contact", href: "#contact", variant: "ghost" } },
    {
        type: "popup",
        data: {
            label: "More",
            variant: "menu",
            children: [
                { type: "button", data: { label: "The middle", href: "#mid", variant: "ghost" } },
                { type: "button", data: { label: "Recap", href: RECAP, variant: "ghost" } },
            ],
        },
    },
]);

test("a published site navigates itself: pinned nav, section links, and a menu", async ({
    page,
    browser,
}) => {
    const filler = colOf(
        Array.from({ length: 14 }, (_, i) => txt(`Filler paragraph number ${i + 1}.`)),
    );
    const id = await makeArtifact(
        page.request,
        "e2e site nav",
        [
            sec("nav", siteNav, {
                pinned: true,
                background: { kind: "color", color: "#101828" },
            }),
            sec(
                "hero",
                colOf([
                    txt("A tall opening band", "h1"),
                    { type: "button", data: { label: "Jump to contact", href: "#contact" } },
                ]),
                { frame: { aspect: 16 / 7 } },
            ),
            sec("mid", filler),
            sec("contact", colOf([txt(LANDED, "h2")])),
        ],
        "web",
    );
    const slug = await publish(page.request, id);

    const anon = await browser.newContext();
    const reader = await anon.newPage();
    await reader.goto(`/p/${slug}`);

    // an internal link is a plain anchor: no new tab, no rel guard
    const navLink = reader.locator('a[href="#contact"]').first();
    await expect(navLink).toBeVisible();
    expect(await navLink.getAttribute("target")).toBeNull();
    expect(await navLink.getAttribute("rel")).toBeNull();

    // the nav's dropdown opens at the top of the page, over the content rather than into it
    const navMenu = reader.locator('[data-live="popup"] [role="button"]').first();
    const navBefore = await boxOf(reader.getByText(BRAND).last());
    await navMenu.click();
    await expect(reader.locator('a[href="#mid"]').first()).toBeVisible();
    expect((await boxOf(reader.getByText(BRAND).last())).y).toBeCloseTo(navBefore.y, 0);
    await reader.keyboard.press("Escape");
    await expect(reader.locator('a[href="#mid"]')).toHaveCount(0);

    // the hero band is at least as tall as its aspect asks, and the target is far below it
    const hero = await boxOf(reader.getByText("A tall opening band").last());
    expect(hero.y).toBeGreaterThan(100);
    // below the fold rather than absent: whether a far section is painted yet is the paint window's
    // business, and what this test is about is that the reader has to travel to reach it
    await expect(reader.getByText(LANDED).last()).not.toBeInViewport();

    await reader.getByText("Jump to contact").last().click();
    await expect(reader.getByText(LANDED).last()).toBeVisible();
    const brand = await boxOf(reader.getByText(BRAND).last());
    const landed = await boxOf(reader.getByText(LANDED).last());
    // the nav rode the scroll down with the reader, and stopped short of the line it was aimed at
    expect(brand.y).toBeLessThan(200);
    expect(landed.y).toBeGreaterThan(brand.y + brand.height);

    // the same trigger while the nav is stuck mid-page: the live overlay has to sit above the
    // pinned layer, or the press lands on the painted stack instead. Its anchors are painted in a
    // portal, so they are intercepted separately.
    await navMenu.click();
    const external = reader.locator(`a[href="${RECAP}"]`).first();
    await expect(external).toHaveAttribute("target", "_blank");
    // two anchors carry this href: the hidden a11y copy and the painted one, so pick by its label
    await reader.getByRole("link", { name: "The middle" }).last().click();
    await expect(reader.locator('a[href="#mid"]')).toHaveCount(0); // the menu closed with the jump
    await expect(reader.getByText("Filler paragraph number 1.").last()).toBeVisible();

    await anon.close();
});

// Element fullscreen paints the fullscreen subtree and nothing else, so a panel portaled to <body>
// exists and never appears. This is the editor's Preview and /present in one assertion: both open
// the same surface fullscreen.
test("a popup still opens while the surface is fullscreen", async ({ page, browser }) => {
    const id = await makeArtifact(page.request, "e2e fullscreen popup", [sec("s1", menu)], "web");
    const slug = await publish(page.request, id);

    const anon = await browser.newContext();
    const reader = await anon.newPage();
    await reader.goto(`/p/${slug}`);

    const trigger = reader.locator('[data-live="popup"] [role="button"]').first();
    await expect(trigger).toBeVisible();
    await reader.keyboard.press("f");
    await expect.poll(() => reader.evaluate(() => !!document.fullscreenElement)).toBe(true);

    await trigger.click();
    const link = reader.locator(`a[href="${PRICING}"]`).last();
    await expect(link).toBeVisible();
    // the panel must live inside the element being shown fullscreen, or it paints nowhere
    expect(
        await reader.evaluate(() => {
            const panel = document.querySelector(".z-popover.overflow-y-auto");
            return !!(panel && document.fullscreenElement?.contains(panel));
        }),
    ).toBe(true);

    await anon.close();
});

// A paged render recovers its regions from painted commands, and a popup's own wrapper paints
// nothing: the overlay has to fall back to the trigger's `hit:` region or a deck has no menus.
test("a popup opens on a deck slide, where regions come from the painted commands", async ({
    page,
    browser,
}) => {
    const id = await makeArtifact(page.request, "e2e deck popup", [sec("s1", menu)], "deck");
    const slug = await publish(page.request, id);

    const anon = await browser.newContext();
    const reader = await anon.newPage();
    await reader.goto(`/p/${slug}`);

    const trigger = reader.locator('[data-live="popup"] [role="button"]').first();
    await expect(trigger).toBeVisible();
    // the overlay sits over the painted trigger, not somewhere else on the slide
    const painted = await boxOf(reader.getByText("More").last());
    const over = await boxOf(trigger);
    expect(over.x).toBeLessThanOrEqual(painted.x);
    expect(over.x + over.width).toBeGreaterThanOrEqual(painted.x + painted.width);

    await trigger.click();
    await expect(reader.locator(`a[href="${PRICING}"]`).last()).toBeVisible();
    await reader.keyboard.press("Escape");
    await expect(reader.locator(`a[href="${PRICING}"]`)).toHaveCount(0);

    await anon.close();
});

// The template chooser's modal stands in for the published page, so it plays like one. Everything
// here runs inside a Modal, which is the part that has to keep working: the popover's key scope
// must sit above the modal's, and the modal must not swallow the panel or its links.
test("the template preview modal opens its menus and follows its own links", async ({ page }) => {
    await page.goto("/templates");
    await page.getByTitle("Product Launch", { exact: true }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    const trigger = page.locator('[data-live="popup"] [role="button"]').first();
    await expect(trigger).toBeVisible();

    await trigger.click();
    const support = page.locator('a[href="https://help.aerone.com"]').last();
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute("target", "_blank");
    await expect(support).toHaveAttribute("rel", "noopener noreferrer");

    // Escape closes the popover first and the modal second, never both at once
    await page.keyboard.press("Escape");
    await expect(page.locator('a[href="https://help.aerone.com"]')).toHaveCount(0);
    await expect(modal).toBeVisible();

    // an internal link moves the preview's own scroller rather than navigating
    await trigger.click();
    await page.locator('a[href="#demo"]').last().click();
    await expect(page.locator('a[href="#demo"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByText("Watch a room clear itself.").last()).toBeVisible();
    // the demo section's video is a real player, not the painted poster
    await expect(page.locator('[data-live="video"] iframe')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
});
