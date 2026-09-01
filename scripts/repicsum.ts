import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { ArtifactContent, Section } from "@model/artifact";
import { asContent, mediaRefKinds } from "@model/artifact";
import { assetIdFromUrl } from "@model/media";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { searchStock, stockReady } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * Replaces picsum-backed imagery with real stock, matched to what each picture is meant to show.
 *
 *   pnpm tsx scripts/repicsum.ts              resolve candidates, write a contact sheet
 *   pnpm tsx scripts/repicsum.ts --write      apply (optionally minus --reject ids)
 *
 * picsum returns an arbitrary photo for a seed and a fixed one for an id, and it has no status page,
 * no SLA, and is currently down. The replacement has to be chosen from intent rather than from the
 * pixels, because the originals cannot be fetched: the seed slug is the template author's art
 * direction, and the section's own words say what the picture is illustrating.
 */

const write = process.argv.includes("--write");
// ids the reviewer ticked: regenerate these with a different photo rather than keeping what was shown
const REJECT = new Set(
    (process.env.REJECT ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
);
const SCRATCH = process.env.SHEET_DIR ?? "/tmp/repicsum";

const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "at",
    "by",
    "from",
    "up",
    "about",
    "into",
    "our",
    "your",
    "their",
    "its",
    "it",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "this",
    "that",
    "these",
    "those",
    "bg",
    "cover",
    "image",
    "photo",
    "hero",
    "backdrop",
    "grain",
    "soft",
    "ambient",
    "texture",
    "paper",
]);

const words = (s: string): string[] =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 2 && !STOP.has(w));

// the seed slug is art direction the template author wrote; an id form carries nothing
const fromSeed = (url: string): string[] => {
    const m = /\/seed\/([^/]+)\//.exec(url);
    return m ? words(decodeURIComponent(m[1]!)) : [];
};

const textOf = (el: unknown, into: string[]): void => {
    if (!el || typeof el !== "object") return;
    const { type, data } = el as { type?: string; data?: Record<string, unknown> };
    if (type === "text" && typeof data?.text === "string") into.push(data.text);
    for (const v of Object.values(data ?? {}))
        if (Array.isArray(v)) for (const kid of v) textOf(kid, into);
};

interface Candidate {
    assetId: string;
    workspaceId: string;
    wasOffered?: string; // what a previous run proposed, so a rejection can pick something else
    artifact: string;
    section: string;
    phrase: string;
    orientation: string;
    was: string;
    now?: { url: string; thumb: string; provider: string; author?: string };
}

const orientOf = (a?: number): string =>
    !a ? "landscape" : a >= 1.2 ? "landscape" : a <= 0.85 ? "portrait" : "square";

async function main(): Promise<void> {
    // what the last run proposed, so a rejected pick can be excluded this time
    const prior = new Map<string, string>();
    if (existsSync(`${SCRATCH}/candidates.json`)) {
        for (const c of JSON.parse(
            readFileSync(`${SCRATCH}/candidates.json`, "utf8"),
        ) as Candidate[])
            if (c.now) prior.set(c.assetId, c.now.url);
    }
    // Applying re-uses the reviewed candidates rather than searching again: a second search can
    // return different photos, which would make the contact sheet a description of something else.
    if (write && !REJECT.size && existsSync(`${SCRATCH}/candidates.json`)) {
        const reviewed = JSON.parse(
            readFileSync(`${SCRATCH}/candidates.json`, "utf8"),
        ) as Candidate[];
        out(`applying ${reviewed.length} reviewed candidates`);
        await apply(reviewed);
        return;
    }
    const ready = stockReady();
    out(
        `providers: ${Object.entries(ready)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ")}`,
    );

    const artifacts = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            workspaceId: schema.artifacts.workspaceId,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts);

    // every picsum asset, with the words around wherever it is used
    const assets = await db.select().from(schema.assets);
    const byId = new Map(assets.map((a) => [a.id, a]));
    const jobs: Candidate[] = [];
    const seen = new Set<string>();

    for (const art of artifacts) {
        const content = asContent(art.draftContent) as ArtifactContent;
        const consider = (
            url: string,
            sectionWords: string[],
            sectionName: string,
            aspect?: number,
        ): void => {
            const id = assetIdFromUrl(url);
            const row = id ? byId.get(id) : undefined;
            if (!row?.origin?.includes("picsum")) return;
            if (seen.has(row.id)) return;
            seen.add(row.id);
            const phrase = [...new Set([...fromSeed(row.origin), ...sectionWords])]
                .slice(0, 6)
                .join(" ");
            jobs.push({
                assetId: row.id,
                workspaceId: row.workspaceId,
                wasOffered: prior.get(row.id),
                artifact: art.title,
                section: sectionName,
                phrase: phrase || words(art.title).slice(0, 4).join(" ") || "abstract texture",
                orientation: orientOf(
                    aspect ?? (row.width && row.height ? row.width / row.height : undefined),
                ),
                was: row.origin,
            });
        };

        for (const sec of content.sections ?? []) {
            const texts: string[] = [];
            textOf((sec as Section).root, texts);
            const sw = words(texts.slice(0, 3).join(" ")).slice(0, 4);
            const name = texts[0]?.slice(0, 40) ?? sec.id;
            for (const [url] of mediaRefKinds({ ...content, sections: [sec] }))
                consider(url, sw, name);
        }
    }

    out(`${jobs.length} picsum assets to rematch\n`);

    // Unsplash has the best photography and the tightest ceiling (50/hr), so it is spent on the
    // pictures people see first; Pexels carries the body at 200/hr.
    const claimed = new Map<string, Set<string>>();
    const claim = (ws: string): Set<string> =>
        claimed.get(ws) ?? claimed.set(ws, new Set<string>()).get(ws)!;
    for (const a of assets)
        if (a.origin && !a.origin.includes("picsum")) claim(a.workspaceId).add(a.origin);
    // a photo the reviewer rejected is burned, so re-resolving picks something else
    for (const j of jobs)
        if (REJECT.has(j.assetId) && j.wasOffered) claim(j.workspaceId).add(j.wasOffered);
    const take = (ws: string, url: string): boolean => {
        const set = claim(ws);
        if (set.has(url)) return false;
        set.add(url);
        return true;
    };

    let i = 0;
    for (const j of jobs) {
        i += 1;
        const order =
            i <= 40
                ? (["unsplash", "pexels", "pixabay"] as const)
                : (["pexels", "pixabay", "unsplash"] as const);
        for (const p of order) {
            if (!ready[p] || j.now) continue;
            const r = await searchStock(p, j.phrase, 1, j.orientation, "photo").catch(() => null);
            // the best result nobody in this workspace has taken: weak phrases all rank the same
            // top hit, and the same photo six times over reads as broken even where it is allowed
            for (const hit of r?.items ?? []) {
                if (!take(j.workspaceId, hit.url)) continue;
                j.now = {
                    url: hit.url,
                    thumb: hit.thumbUrl,
                    provider: p,
                    author: hit.attribution?.author,
                };
                break;
            }
        }
        out(
            `  ${String(i).padStart(3)}/${jobs.length}  ${j.now ? j.now.provider.padEnd(9) : "NO MATCH ".padEnd(9)} ${j.phrase.slice(0, 46)}`,
        );
    }

    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}/candidates.json`, JSON.stringify(jobs, null, 2));
    writeFileSync(`${SCRATCH}/index.html`, sheet(jobs));
    out(`\ncontact sheet: ${SCRATCH}/index.html`);

    if (!write) {
        out(
            `${jobs.filter((j) => j.now).length} matched, ${jobs.filter((j) => !j.now).length} unmatched (dry run, pass --write)`,
        );
        return;
    }

    await apply(jobs);
}

async function apply(jobs: Candidate[]): Promise<void> {
    const reject = new Set(
        (process.env.REJECT ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
    let done = 0;
    for (const j of jobs) {
        if (!j.now || reject.has(j.assetId)) continue;
        await db
            .update(schema.assets)
            .set({
                origin: j.now.url,
                source: "stock",
                meta: {
                    attribution: { provider: j.now.provider, author: j.now.author },
                    thumbUrl: j.now.thumb,
                },
            })
            .where(eq(schema.assets.id, j.assetId));
        done += 1;
    }
    out(`repointed ${done} assets (${reject.size} rejected)`);
}

function sheet(jobs: Candidate[]): string {
    const rows = jobs
        .map(
            (
                j,
            ) => `<label class="c${j.now ? "" : " miss"}"><input type="checkbox" value="${j.assetId}">
      <div class="img">${j.now ? `<img loading="lazy" src="${j.now.thumb}">` : `<div class="none">no match</div>`}</div>
      <div class="m"><b>${esc(j.artifact)}</b><span>${esc(j.section)}</span>
      <code>${esc(j.phrase)}</code><em>${j.now ? `${j.now.provider}${j.now.author ? " · " + esc(j.now.author) : ""}` : "&mdash;"}</em></div></label>`,
        )
        .join("\n");
    return `<!doctype html><meta charset="utf-8"><title>Picsum replacements</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:20px;font:13px/1.5 system-ui;background:#f6f5f2;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}
h1{font:600 20px/1.2 system-ui;margin:0 0 4px}
p.sub{margin:0 0 18px;opacity:.7}
.bar{position:sticky;top:0;background:inherit;padding:10px 0;border-bottom:1px solid #8884;margin-bottom:14px;display:flex;gap:10px;align-items:center}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.c{display:block;background:#fff2;border:1px solid #8883;border-radius:10px;overflow:hidden;cursor:pointer}
.c:has(:checked){outline:2px solid #c0392b;opacity:.45}
.c input{position:absolute;opacity:0}
.img{aspect-ratio:3/2;background:#8882}
.img img{width:100%;height:100%;object-fit:cover;display:block}
.none{display:grid;place-items:center;height:100%;opacity:.5}
.m{padding:8px 10px;display:grid;gap:2px}
.m b{font-size:12px}.m span{font-size:11px;opacity:.65}
.m code{font-size:11px;opacity:.8;font-family:ui-monospace,monospace}
.m em{font-size:11px;opacity:.6;font-style:normal}
.miss{outline:1px dashed #c0392b}
</style>
<h1>Picsum replacements</h1>
<p class="sub">Tick anything you want to <b>keep as picsum</b> (rejected). Everything unticked gets repointed.</p>
<div class="bar"><button id="copy">Copy rejected ids</button><span id="n"></span></div>
<div class="grid">${rows}</div>
<script>
const boxes=[...document.querySelectorAll('input')];
const n=document.getElementById('n');
const tally=()=>n.textContent=boxes.filter(b=>b.checked).length+' rejected of '+boxes.length;
boxes.forEach(b=>b.addEventListener('change',tally));tally();
document.getElementById('copy').onclick=async()=>{
  const ids=boxes.filter(b=>b.checked).map(b=>b.value).join(',');
  await navigator.clipboard.writeText(ids);
  n.textContent='copied '+(ids?ids.split(',').length:0)+' ids';
};
</script>`;
}

const esc = (s: string): string =>
    s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

await main();
process.exit(0);
