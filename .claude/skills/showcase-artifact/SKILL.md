---
name: showcase-artifact
description: Generate real-life, template-grade showcase artifacts (deck, doc, or site) into the local demo library, using the full element vocabulary including pins, rotation, layering and clamps, with a mandatory visual verification loop.
---

# Showcase artifact generation

You are acting as a design expert building an artifact a real person or business would ship: a
launch deck, a wholesale catalogue, a studio site, a campaign book, an annual letter. The output
goes into the local demo library (Premium Workspace, demo@galleo.app) and must be good enough to
promote into `services/core/templates.ts` later. Beauty, storyline cohesion and real-life
plausibility outrank feature coverage. This file is the distillation of a 27-artifact run; every
rule below was earned by a defect that shipped without it.

## Process (in order, no skipping)

1. **Concept.** Invent one business and commit: a name, a city, a voice, numbers that could be
   real. First list the demo library's titles (`select title from artifacts` on the demo
   workspace) and pick an industry none of them covers. **Cast the photos before committing**:
   Pexels is deep on workshops, kitchens, harbors, mountains, textiles, bars, pools, trains, and
   thin on niche machinery and specific landmarks; a concept whose key image needs a lookalike
   starts a point down. The concept must supply a *reason to be dense*: an allocation to justify a
   table, a season to justify a chart, an objection to answer honestly.
2. **Section rhythm.** Sketch 9 to 14 sections before writing code. The arc that works: cover
   with a full-photo background → the numbers ("what happened") → a story or problem split → a
   product trio or gallery grid → a table with real prices → one full-bleed mood band → a tabs or
   FAQ section → the people, with faces → a chart if the story has a series → quote or testimonial
   → a CTA close that sounds like a person. A deck alternates full-photo moments with dense ones; a
   doc reads like an editorial spread; a site opens with a docked nav + hero and closes with a
   linked footer.
3. **Build with the authoring DSL** (`@model/authoring`: `deck/doc/web`, `section`, `col/row/split/
   grid`, `t`, `img`, `stat`, `table`, `chart`, `diagram`, `tabs`, `faq`, `pricing`, `feature`,
   `profile`, `testimonial`, `quote`, `card`, `polaroid`, `pin`, `badge`, `checks`, `linked`,
   `divider`, `fill`, `w`) in a temp script at repo root, deleted after. Never hand-write raw
   `ElementInstance` JSON when a builder exists. Validate with `isArtifactContent` before insert.
4. **Source every photo live, per slot** (helper below): one Pexels query per image, briefed from
   the copy that photo sits beside, not from the piece's title.
5. **Insert** through the real write path: `contentColumns` + `syncArtifactAssets` (script below).
6. **Shoot every section** with the shot pipeline, then actually LOOK at each image against the
   defect checklist. A build that was not looked at is not done; in practice one artifact in three
   ships a miscast photo, a ghost avatar, or a squeezed row on the first pass.
7. **Iterate** at least once, rebuild, reshoot. For a deck, also re-shoot with `format: "web"` and
   confirm pinned elements keep their corners.
8. **Report** honestly: title, id, storyline in one sentence, where each capability is used, what
   still looks imperfect.

## Layout law (each of these shipped broken once)

- **`row(a, b, c)` bare = equal shared tracks. `row({ align: … }, a, b, c)` = intrinsic-width flex.**
  Adding an options object silently changes the sizing model. Image-led children hide it (images
  expand); text-first children collapse to min-content and names wrap mid-word. Therefore:
  - People rows are always `row(fill(profile(…)), fill(profile(…)), …)` — the template idiom.
  - A people row with a polaroid is `split(70, row(fill(…), …), polaroid(…))`, so the polaroid can
    never starve the people.
  - Photo trios may use `row({ align: "start" }, img…, img…, img…)`; that is the one safe use.
- **Never pin a polaroid at a section edge.** Edge pins (`"end","end"` etc. with offsets) clip in
  paged rendering, in three separate artifacts, with three different offset attempts. Place
  polaroids inline (in a split or as a grid tile). Pins are for badges only.
- **Pinned badges**: one or two per artifact, `pin(badge("…"), "end", "start", { dx: -26, dy: 26,
  rotate: ±2 })`, riding on a photo background. Small rotation, small insets.
- **`bleed: true` on site sections only.** A doc section with bleed renders as a full-width site
  band in the editor; a doc hero keeps its reading column even with a painted background. Decks
  never need it.
- **Every artifact sets an artifact-level background** (the `deck/doc/web` third argument, or
  assign `content.background`): a texture matched to the piece (linen, water, wood grain, silk,
  flour, basalt), scrim ~0.05–0.1 on light themes, ~0.45–0.55 on dark. It paints the canvas around
  sections and is most of what makes the editor view feel finished.

## Data contract

- `SectionBackground.image` is a STRING url with sibling `scrim`; not an object.
- **No commas inside table cells — including thousands separators.** "2,720 GBP" splits into two
  cells; write "2720 GBP". Rows by newline, cells by comma, column count must match the header.
  Use middots to join label + value inside a cell (`Coastal · two nights`).
- Container `surface`: solid | outline | sideline | topline | plain. Button `variant`: filled |
  outline | soft | ghost. Text `style`: from `TEXT_STYLES` in `model/elements.ts`.
- Section ids unique per artifact.
- `profile(name, role, face?, note?)` and `testimonial(said, name, role, face?)` render a **ghost
  avatar without a face URL**. Every person shown gets a face, or becomes a `card(t(name,"h3"),
  t(copy,"body"))` if deliberately collective ("The committee", "The eleven").
- Themes are built-in ids (`vellum`, `onyx`, `couture`, `carbon`, `studio`, `press`, `obsidian`,
  `atelier`…). Pair palette to subject: couture for luxe goods, carbon/obsidian for machines and
  concrete, vellum/onyx for heritage and night, studio/press for editorial daylight, atelier for
  textile and craft.

## Imagery (the selection discipline is most of the beauty)

- Address photos by Pexels URL:
  `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=W&h=H`.
  Sizes: hero/band 1700x1100 · split/card 1100x900 or 1400x900 · gallery tile 800x800 · portrait
  700x700 (or 800x1000 for tall product shots). Never a placeholder host; picsum is dead.
- **One query per image, written from the copy beside it.** The subject belongs to what the section
  says, in the industry the piece is in. Vary subjects across the piece; one concept repeated down
  an artifact is the classic failure.
- **Avatars need face-explicit queries** ("portrait", "headshot", "face", "smiling") — a query like
  "welder portrait workshop" returns a masked action scene that reads wrong in a circle crop.
- **Verify against the checklist below.** First-result picks miscast constantly: a heatmap for a
  contour map, branded whisky bottles in a gin deck, a neon shop sign for a perfume, moss for
  cedar. If the search term names a *thing*, confirm the photo contains that thing.
- **Never use one photo twice in a piece.** Keep a claimed set across slots.
- Backgrounds under scrims want atmospheric and open compositions with room for type; galleries
  want subjects; avoid photos containing readable third-party brands, watermarks, or UI screens.
- On insert, `contentColumns` adopts external images into workspace media and rewrites srcs to
  `/api/media/asset/…`. When shooting from file://, absolutize those to
  `http://localhost:8600/api/media/asset/…`.

```ts
// per-slot sourcing helper for the temp script
const claimed = new Set<string>();
async function photo(query: string, wpx = 1400, hpx = 900): Promise<string> {
    await new Promise((r) => setTimeout(r, 1100)); // Pexels enforces an unadvertised hourly cap
    const r = await searchStock("pexels", query, 1, wpx >= hpx ? "landscape" : "portrait", "photo");
    const pick = r.items.find(
        (m) => !claimed.has(m.url) && !/pexels|watermark|logo/i.test(m.alt ?? ""),
    );
    if (!pick) throw new Error(`no photo for "${query}"`);
    claimed.add(pick.url);
    return `${pick.url.split("?")[0]}?auto=compress&cs=tinysrgb&fit=crop&w=${wpx}&h=${hpx}`;
}
```

## Copy voice

- Confident and quiet; the business states facts and lets restraint carry the brag ("Small on
  purpose. Late never." · "We cap the year at 240"). No em-dashes anywhere user-visible, no
  AI-smell phrasing, varied construction across sibling blurbs.
- **Numbers must reconcile.** If the chart says 180+372+505+548+391+144, the stat that says "2,140
  charters" must be their sum; a use-of-funds table must sum to the ask. Readers check.
- Include one honest-objection section (seasonality, price, waiting list) answered plainly; it is
  the most convincing section in every piece that has one.
- Captions carry personality ("weather happens", "the sleeper hit", "opinions expected"); tables
  stay dry.
- Middots join label pairs (`Invited · expires in 2 days`); a period ends a thought.

## Post-shoot defect checklist (scan every section image)

- Squeezed columns / names wrapping mid-word → a `row({opts}, …)` where fill-tracks were meant.
- Ghost avatar circles → missing face URL.
- A sliver of clipped content at a section edge → an edge-pinned polaroid; move it inline.
- Same photo appearing twice.
- A photo that contradicts its caption, contains readable third-party branding, or is near-black.
- Table columns misaligned → a comma inside a cell (check thousands separators first).
- A doc section rendering full-bleed → stray `bleed: true`.
- Murky heroes: if the title is hard to read, lower the scrim or pick a more open photo.

## Insert script (temp file at repo root, deleted after)

```ts
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { bgImage /* + the DSL you use */ } from "@model/authoring";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentColumns, isArtifactContent } from "@services/core/artifacts";
import { searchStock, syncArtifactAssets } from "@services/core/media";
import { out } from "@services/utils/env";

async function main(): Promise<void> {
    const content: ArtifactContent = /* built with the DSL + photo() */ null!;
    content.background = bgImage(await photo("…canvas texture…", 1700, 1100), 0.5);
    if (!isArtifactContent(content)) throw new Error("content failed the artifact guard");
    const [user] = await db.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.email, "demo@galleo.app"));
    const [ws] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces)
        .where(eq(schema.workspaces.slug, "demo"));
    if (!user || !ws) throw new Error("run pnpm seed first");
    const { columns, assetIds } = await contentColumns(ws.id, content, db);
    // upsert by title so an iteration updates in place instead of duplicating
    const title = "…";
    const [existing] = await db.select({ id: schema.artifacts.id }).from(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws.id), eq(schema.artifacts.title, title)));
    let id: string;
    if (existing) {
        await db.update(schema.artifacts).set({ ...columns, updatedAt: new Date() })
            .where(eq(schema.artifacts.id, existing.id));
        id = existing.id;
    } else {
        const [row] = await db.insert(schema.artifacts)
            .values({ workspaceId: ws.id, title, ...columns, createdBy: user.id })
            .returning({ id: schema.artifacts.id });
        id = row!.id;
    }
    await syncArtifactAssets(id, assetIds, db);
    out(`-> ${id}`);
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

Note: custom (workspace) themes are invisible to this headless page; built-in theme ids render
correctly. If a piece uses a custom theme row, register it via `registerThemes` before painting.

## Environment notes

- Postgres: `postgres://galleo:galleo@localhost:8602/galleo` (docker compose up -d). Dev server at
  8600 for media urls and manual review at `localhost:8600/app`.
- `pnpm seed` merges and never touches artifacts, so inserted rows survive a reseed. Only
  `pnpm seed --full` (the e2e fixture build) wipes and rebuilds; if a row vanishes, re-insert.
- To group work, resolve or create a `folders` row by name and set `folderId` on insert
  ("Explorations" is the current gallery).
- Never commit or push. Never touch repo source for a generation task. Temp scripts at repo root,
  deleted after; screenshots in the session scratchpad.
