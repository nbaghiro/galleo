// Screenshot every element's selection bar and docked panel against a running dev server, so a
// distribution decision (what sits on the bar, what in the panel) is made on pixels rather than on
// the schema. Not a CI job: a tool for the next round of `.docs/planning/control-distribution.md`.
//
//   pnpm survey:controls                 writes to .local/survey-controls
//   pnpm survey:controls --out DIR       somewhere else
//   GALLEO_SURVEY_BASE / _EMAIL / _PASSWORD override the server and the persona (the demo one by default)
//
// It builds a scratch artifact with one section per palette element (a caption above each), opens it
// in headless Chromium at 1440 × 900, presses each element in turn and captures `[data-galleo-toolbar]`
// and the flyout. Two things it has to know about the editor: sections load in a window, so it walks
// the stack in order rather than jumping; and a press on a composite lands on a child, so each case is
// captured again after Escape (the parent) and once more after another (the section).

import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";
import "@elements/register";
import { getElement, listElements } from "@elements/spec";
import type { ElementInstance } from "@model/artifact";

const w = (s: string): boolean => process.stdout.write(`${s}\n`);

const BASE = process.env.GALLEO_SURVEY_BASE ?? "http://localhost:8600";
const EMAIL = process.env.GALLEO_SURVEY_EMAIL ?? "demo@galleo.app";
const PASSWORD = process.env.GALLEO_SURVEY_PASSWORD ?? "galleo-demo-2026";
const outFlag = process.argv.indexOf("--out");
const OUT = outFlag >= 0 ? process.argv[outFlag + 1]! : ".local/survey-controls";

const HIDDEN = new Set(["container", "avatar", "chart", "diagram", "media"]);
const VIEWPORT = { width: 1440, height: 900 };

const caption = (text: string): ElementInstance => ({
    type: "text",
    data: { text, style: "caption" },
});

// caption above the element inside a column, so the element is a movable child with a known top
const sectionFor = (type: string): { id: string; root: ElementInstance } => ({
    id: `s-${type}`,
    root: {
        type: "container",
        data: { children: [caption(`CASE ${type}`), { type, data: getElement(type)!.create() }] },
    },
});

async function main(): Promise<void> {
    mkdirSync(OUT, { recursive: true });
    const types = listElements()
        .filter((s) => !HIDDEN.has(s.type))
        .map((s) => s.type);
    const api = await request.newContext({ baseURL: BASE });
    const login = await api.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
    const made = await api.post("/api/artifacts", {
        data: {
            title: "Control survey (scratch)",
            draftContent: { format: "doc", theme: "studio", sections: types.map(sectionFor) },
        },
    });
    if (!made.ok()) throw new Error(`create failed: ${made.status()}`);
    const { id } = (await made.json()) as { id: string };
    w(`artifact ${id} with ${types.length} sections`);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        storageState: await api.storageState(),
        viewport: VIEWPORT,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/app/edit/${id}`);
    await page.waitForSelector("main");
    await page.waitForTimeout(3000);
    const stage = page.locator("main");

    const shoot = async (name: string): Promise<void> => {
        await page.waitForTimeout(450);
        const bars = page.locator("[data-galleo-toolbar]");
        const n = await bars.count();
        let saved = 0;
        for (let i = 0; i < n; i++) {
            const box = await bars.nth(i).boundingBox();
            if (!box || box.width < 60) continue; // the comment button carries the marker too
            await bars.nth(i).screenshot({ path: `${OUT}/${name}.bar.png` });
            saved++;
        }
        const flyout = page.locator("[data-testid=right-flyout]");
        const panel = await flyout.count();
        if (panel) await flyout.first().screenshot({ path: `${OUT}/${name}.panel.png` });
        w(`${name}: bar=${saved ? "yes" : "no"} panel=${panel ? "yes" : "no"}`);
    };

    for (const type of types) {
        const label = stage.getByText(`CASE ${type}`, { exact: true }).last();
        await label.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        const box = await label.boundingBox();
        if (!box) {
            w(`${type}: caption not painted, skipped`);
            continue;
        }
        // just inside the element's top-left: the caption's gap is 14px
        await page.mouse.click(box.x + 24, box.y + box.height + 22);
        await shoot(type);
        await page.keyboard.press("Escape");
        await shoot(`${type}.up`);
        await page.keyboard.press("Escape");
        await shoot(`${type}.up2`);
        await page.keyboard.press("Escape");
        await page.mouse.click(VIEWPORT.width - 140, 80);
        await page.waitForTimeout(150);
    }
    await browser.close();
    await api.dispose();
    w(`done: ${OUT}`);
}

main().catch((e: unknown) => {
    w(String(e));
    process.exit(1);
});
