---
name: showcase-artifact
description: Generate real-life, template-grade showcase artifacts (deck, doc, or site) into the local demo library, using the full element vocabulary including pins, rotation, layering and clamps, with a mandatory visual verification loop.
---

# Showcase artifact generation

You are acting as a design expert building an artifact a real person or business would ship: a
menu, a launch deck, a studio site, an itinerary, a price list, an annual letter. The output goes
into the local demo library (Premium Workspace, demo@galleo.app) and must be good enough to promote
into `services/core/templates.ts` later. Beauty, storyline cohesion and real-life plausibility
outrank feature coverage.

## Process (in order, no skipping)

1. **Concept.** Pick one business or occasion and commit to it. Reuse a fiction universe from
   `services/core/templates.ts` (Mise, Northwind, Fleetwise, Anvil & Oak, The Quince, Harborlight,
   Tidepool, Halvorsen...) or invent one equally grounded: a name, a city, a voice, numbers that
   could be real. Every section serves the one story. First list the titles already in the demo
   library (`select title from artifacts` on the demo workspace) and pick an industry none of them
   covers. **Cast the photos before committing**: the curated catalog decides what stories can be
   told well (it has workshops, harbors, kitchens, offices, cities and fields; it has no semi
   trucks and no Scottish moors), and a concept whose key image must be faked with a lookalike
   starts a point down.
2. **Section rhythm.** Sketch 6 to 9 sections before writing any code: what each says, which is a
   band, where the images live, where one composition move (a pin, a tilt, an overlap) earns its
   place. A deck alternates full-photo moments with dense ones; a doc reads like an editorial
   spread; a site opens with a docked nav + hero and closes with a linked footer.
3. **Build** the content as raw `ElementInstance` JSON in a temp script (repo root, deleted after)
   using the data contract below. Validate with `isArtifactContent` before insert.
4. **Insert** through the real write path (script template below): `contentColumns` +
   `syncArtifactAssets`. Never raw JSON into the row.
5. **Shoot every section** with the shot pipeline (template below), then actually LOOK at each
   image. This step is where quality happens; a build that was not looked at is not done.
6. **Iterate** at least once: fix cramped bands, accidental-looking overlap, unreadable contrast,
   orphan whitespace, images that miscast their caption. For a deck, re-shoot with
   `format: "web"` and confirm pinned elements keep their corners through the translation.
7. **Report** honestly: title, id, storyline in one sentence, where each capability is used, what
   still looks imperfect.

## Design language (when to use what)

- **Pinned badge / corner label** (`layout.pin: {x, y, dx, dy, z}`): a date chip, SEASONAL, "sold
  out", a price flash. One or two per artifact, always on a photo or card corner, insets 12 to 32px.
- **Overlapping card**: pin a card with negative `dy` so it rides up over a hero's bottom edge, or
  negative `dx` over a photo's side. The classic site move.
- **Negative z decoration** (`z: -1`): a photo or texture sliding UNDER text. Keep the overlap
  shallow enough that no word sits on busy texture.
- **Group rotation**: a pinned container (photo + caption, surface "solid") rotated 4 to 8 degrees
  reads as a polaroid or taped note. Rotate the group, not a bare image, and keep |deg| small.
- **Typography round**: `align: "baseline"` on a container row for a big-number + caption line;
  `maxLines` on text cards that must stay uniform; `clamp` on tables (menus, price lists, hours).
- **Everything that already existed**: section image backgrounds with `scrim` 0.35 to 0.6, tone
  bands for rhythm, `bleed: true` on site sections only (a doc keeps every section in its reading
  column, photo heroes included; never on decks), stats, quotes, timelines,
  charts/diagrams only where the story has numbers, `dock: "top"` nav on sites (first section,
  once), linked footers built from real link marks.
- **Restraint**: a pin that does not serve the story is noise. Sections with no move at all are
  fine; the moves land because they are rare.

## Data contract (the mistakes already made once)

- `SectionBackground.image` is a STRING url with sibling `scrim`; not an object.
- Table legacy `data`: rows by newline, cells by comma, so NO commas inside a cell (use middots or
  rephrase). Column count must match the header row.
- Container `surface`: solid | outline | sideline | topline | plain. Button `variant`: filled |
  outline | soft | ghost. Text `style`: from `TEXT_STYLES` in `model/elements.ts`.
- `pin.dx/dy` are compose-scale px. Width on a pinned element: `"fit"` or `{pct}` , never full.
- Section ids unique per artifact. `bleed: true` on site sections only: a doc section with bleed
  renders as a full-width site band in the editor, so a doc hero keeps its reading column even with
  a painted background. Never needed on decks.
- Copy: no em-dashes anywhere user-visible, no AI-smell phrasing ("delve", "seamless", hedged
  hype), vary sentence construction across sibling blurbs, numbers that could be real.

## Imagery

- Source photos from Pexels and address them by their own URL:
  `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=W&h=H`,
  common sizes 1100x900, 1400x900, 1700x1100. picsum is gone: it went down on 2026-08-29 and took
  every placeholder in the product with it, which is why nothing here may name a placeholder host.
- Find one with the media picker, or search Pexels directly. Brief the query from the copy the photo
  sits beside rather than the piece's title: a deck named "Startup Pitch" whose content is a
  restaurant business wants kitchens, not startups. Vary the subject across a piece so it does not
  read as one concept repeated. Verify a photo fits its caption; a miscast image is a finding.
- On insert, `contentColumns` adopts external images into workspace media and rewrites srcs to
  `/api/media/asset/...`. When shooting the stored row from file://, absolutize those to
  `http://localhost:8600/api/media/asset/...`.

## Insert script (temp file at repo root, run with npx tsx, delete after)

```ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentColumns, isArtifactContent } from "@services/core/artifacts";
import { syncArtifactAssets } from "@services/core/media";
import { out } from "@services/utils/env";

const content: ArtifactContent = { format: "deck", theme: "editorial", sections: [/* ... */] };

async function main(): Promise<void> {
    if (!isArtifactContent(content)) throw new Error("content failed the artifact guard");
    const [user] = await db.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.email, "demo@galleo.app"));
    const [ws] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces)
        .where(eq(schema.workspaces.name, "Premium Workspace"));
    if (!user || !ws) throw new Error("run pnpm seed first");
    const { columns, assetIds } = await contentColumns(ws.id, content, db);
    const [row] = await db.insert(schema.artifacts)
        .values({ workspaceId: ws.id, title: "...", ...columns, createdBy: user.id })
        .returning({ id: schema.artifacts.id });
    if (row) await syncArtifactAssets(row.id, assetIds, db);
    out(`inserted ${row?.id}`);
    process.exit(0);
}
void main();
```

## Shot script (per-section screenshots of the stored row)

```ts
import "dotenv/config";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

const REPO = process.cwd();
const [ID, OUT, FORMAT] = process.argv.slice(2); // artifact id, out dir, optional format override

async function main(): Promise<void> {
    const [row] = await db.select({ content: schema.artifacts.draftContent })
        .from(schema.artifacts).where(eq(schema.artifacts.id, ID!));
    if (!row) throw new Error("row missing");
    const bundle = (await build({
        entryPoints: [join(REPO, "scripts/shot.entry.ts")], bundle: true, write: false,
        format: "iife", platform: "browser", target: "es2022",
        tsconfig: join(REPO, "tsconfig.json"), logLevel: "silent",
    })).outputFiles![0]!.text;
    const css = readFileSync(join(REPO, "public/fonts.css"), "utf8")
        .replaceAll("url('/fonts/", `url('file://${REPO}/public/fonts/`);
    const dir = mkdtempSync(join(tmpdir(), "shot-"));
    writeFileSync(join(dir, "p.html"),
        `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body><div id="stage"></div><script>${bundle}</script></body></html>`);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await page.goto(`file://${dir}/p.html`);
    await page.evaluate(async () => {
        await Promise.race([
            Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined))),
            new Promise((r) => setTimeout(r, 20000)),
        ]);
    });
    const base = { ...(row.content as object), ...(FORMAT ? { format: FORMAT } : {}) };
    const absolute = JSON.parse(JSON.stringify(base)
        .replaceAll("/api/media/asset/", "http://localhost:8600/api/media/asset/"));
    const secs = (await page.evaluate((a) => {
        return (window as never as { __galleo: { paint(c: unknown): { id: string }[] } }).__galleo.paint(a);
    }, absolute)) as { id: string }[];
    const pending = await page.evaluate(() =>
        (window as never as { __galleo: { imagesSettled(ms: number): Promise<number> } }).__galleo.imagesSettled(60000));
    if (pending) console.error(`images still pending: ${pending}`);
    for (const s of secs)
        await page.locator(`[data-section=${s.id}]`).screenshot({ path: `${OUT}/${s.id}.png` });
    await browser.close();
    process.exit(0);
}
void main();
```

## Environment notes

- Postgres: `postgres://galleo:galleo@localhost:8602/galleo` (docker compose up -d). Dev server at
  8600 for media urls and manual review at `localhost:8600/app`.
- `pnpm seed` merges and never touches artifacts, so inserted rows survive a reseed. Only
  `pnpm seed --full` (the e2e fixture build) wipes and rebuilds; if a row vanishes, re-insert.
- Never commit or push. Never touch repo source for a generation task. Temp scripts at repo root,
  deleted after; screenshots in the session scratchpad.
