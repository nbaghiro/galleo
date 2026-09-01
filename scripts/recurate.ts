import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { MediaItem } from "@model/media";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { searchStock } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * Re-picks the imagery for artifacts that were on picsum, one search per artifact rather than one
 * per picture.
 *
 *   pnpm tsx scripts/recurate.ts            search, write a picker
 *   pnpm tsx scripts/recurate.ts --write    apply CHOICES=<json path>
 *
 * Per-image keyword search produced literal, staged results: a section reading "AI made the first
 * draft free" returned a crumpled first draft. A deck's pictures are a set, so the subject is the
 * artifact and the search runs once for it, which also keeps us inside Unsplash's 50/hr demo
 * ceiling. The rest of each result page becomes the alternates the picker offers, so choosing is a
 * click rather than another request.
 */

const write = process.argv.includes("--write");
const SCRATCH = process.env.SHEET_DIR ?? "/tmp/recurate";
const PRIOR = process.env.PRIOR ?? `${SCRATCH}/../repicsum/candidates.json`;

// Stock search rewards nouns and punishes sentences; these steer away from the staged commercial
// look that "business", "team" and "success" reliably return.
const TONE = "documentary natural light muted";

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
    "this",
    "that",
    "these",
    "those",
    "how",
    "what",
    "why",
    "we",
    "you",
    "they",
    "not",
    "but",
    "can",
    "will",
    "just",
    "more",
    "most",
    "new",
    "one",
    "two",
    "all",
    "when",
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
    "deck",
    "page",
    "landing",
    "report",
    "proposal",
    "letter",
    "resume",
    "invite",
    "essay",
    "notes",
    "launch",
    "site",
]);

const words = (s: string): string[] =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 2 && !STOP.has(w));

interface Prior {
    assetId: string;
    workspaceId: string;
    artifact: string;
    section: string;
    phrase: string;
    orientation: string;
    was: string;
}

interface Slot extends Prior {
    pick?: MediaItem;
    alternates: MediaItem[];
}

async function main(): Promise<void> {
    const prior = JSON.parse(readFileSync(PRIOR, "utf8")) as Prior[];
    // a targeted re-run keeps every slot the last pass filled
    const kept = new Map<string, Pick<Slot, "pick" | "alternates">>();
    if (existsSync(`${SCRATCH}/slots.json`))
        for (const s of JSON.parse(readFileSync(`${SCRATCH}/slots.json`, "utf8")) as Slot[])
            kept.set(s.assetId, { pick: s.pick, alternates: s.alternates });

    if (write) {
        const chosen = JSON.parse(readFileSync(process.env.CHOICES!, "utf8")) as Record<
            string,
            MediaItem
        >;
        let n = 0;
        for (const [assetId, m] of Object.entries(chosen)) {
            await db
                .update(schema.assets)
                .set({
                    origin: m.url,
                    source: "stock",
                    width: m.width || null,
                    height: m.height || null,
                    alt: m.alt ?? null,
                    meta: { attribution: m.attribution, thumbUrl: m.thumbUrl },
                })
                .where(eq(schema.assets.id, assetId))
                .catch(() => {});
            n += 1;
        }
        out(`applied ${n} choices`);
        return;
    }

    // A piece about software searches as software, and stock answers with screenshots of dashboards.
    // Naming the mood instead gets pictures worth looking at, which is what the slot actually needs.
    const overrides = JSON.parse(process.env.OVERRIDES ?? "{}") as Record<string, string>;
    const only = new Set(Object.keys(overrides).filter(() => process.env.ONLY === "overrides"));

    // one subject per artifact: its own words, not the sentence beside each picture
    const byArtifact = new Map<string, Prior[]>();
    for (const p of prior)
        (byArtifact.get(p.artifact) ?? byArtifact.set(p.artifact, []).get(p.artifact)!).push(p);

    const slots: Slot[] = [];
    let i = 0;
    for (const [artifact, rows] of byArtifact) {
        i += 1;
        if (only.size && !only.has(artifact)) {
            for (const row of rows)
                slots.push({ ...row, ...(kept.get(row.assetId) ?? { alternates: [] }) });
            continue;
        }
        // the slugs the template author wrote are the best art direction available; the title is the
        // fallback when every picture in the piece came from an id form that carries nothing
        const slugWords = rows.flatMap((r) => words(r.phrase)).filter(Boolean);
        const common = [...new Set(slugWords)].slice(0, 3);
        const subject = (common.length ? common : words(artifact).slice(0, 3)).join(" ");
        const query = overrides[artifact] ?? `${subject} ${TONE}`.trim();

        const pool: MediaItem[] = [];
        for (const orientation of ["landscape", "portrait"] as const) {
            if (!rows.some((r) => r.orientation === orientation)) continue;
            for (const provider of ["unsplash", "pexels"] as const) {
                // a page is 30, and a photo essay can hold more pictures than that; keep paging
                // until the piece has enough for every slot to get a different one
                for (let page = 1; page <= 3; page += 1) {
                    const r = await searchStock(provider, query, page, orientation, "photo").catch(
                        () => null,
                    );
                    if (!r?.items.length) break;
                    pool.push(...r.items);
                    if (pool.length >= rows.length + 8 || !r.hasMore) break;
                }
                if (pool.length) break; // this provider answered; do not spend another call
            }
        }

        const used = new Set<string>();
        for (const row of rows) {
            const fits = pool.filter(
                (m) =>
                    !used.has(m.url) &&
                    (row.orientation === "portrait" ? m.height >= m.width : m.width >= m.height),
            );
            const pick = fits[0] ?? pool.find((m) => !used.has(m.url));
            if (pick) used.add(pick.url);
            slots.push({
                ...row,
                pick,
                alternates: pool.filter((m) => m.url !== pick?.url).slice(0, 11),
            });
        }
        out(
            `  ${String(i).padStart(2)}/${byArtifact.size}  ${String(rows.length).padStart(3)} imgs  ${pool.length} candidates  ${query.slice(0, 44)}`,
        );
    }

    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}/slots.json`, JSON.stringify(slots, null, 2));
    writeFileSync(`${SCRATCH}/index.html`, picker(slots));
    out(`\n${slots.filter((s) => s.pick).length}/${slots.length} filled`);
    out(`picker: ${SCRATCH}/index.html`);
}

function picker(slots: Slot[]): string {
    const groups = new Map<string, Slot[]>();
    for (const s of slots)
        (groups.get(s.artifact) ?? groups.set(s.artifact, []).get(s.artifact)!).push(s);
    const body = [...groups]
        .map(
            ([artifact, rows]) =>
                `<section><h2>${esc(artifact)}</h2><div class="grid">${rows
                    .map(
                        (s, n) => `<div class="slot" data-id="${s.assetId}">
        <div class="main"><img loading="lazy" src="${s.pick?.thumbUrl ?? ""}" data-url='${json(s.pick)}'></div>
        <div class="cap">${esc(s.section).slice(0, 46) || `image ${n + 1}`}</div>
        <div class="alts">${s.alternates
            .map(
                (a) =>
                    `<img loading="lazy" src="${a.thumbUrl}" data-url='${json(a)}' title="${esc(a.alt ?? "")}">`,
            )
            .join("")}</div></div>`,
                    )
                    .join("")}</div></section>`,
        )
        .join("\n");
    return `<!doctype html><meta charset="utf-8"><title>Recurate</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:20px 24px 80px;font:13px/1.5 system-ui;background:#f6f5f2;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}
h1{font:600 20px/1.2 system-ui;margin:0 0 2px}
h2{font:600 14px/1.2 system-ui;margin:26px 0 10px;opacity:.75}
p.sub{margin:0 0 10px;opacity:.7}
.bar{position:sticky;top:0;z-index:5;background:inherit;padding:10px 0;border-bottom:1px solid #8884;display:flex;gap:10px;align-items:center}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.slot{border:1px solid #8883;border-radius:10px;overflow:hidden;background:#fff2}
.main img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:#8882}
.cap{padding:6px 8px;font-size:11px;opacity:.7}
.alts{display:flex;gap:3px;padding:0 6px 8px;overflow-x:auto}
.alts img{width:44px;height:32px;object-fit:cover;border-radius:4px;cursor:pointer;opacity:.65;flex:0 0 auto}
.alts img:hover{opacity:1;outline:2px solid #c0392b}
</style>
<h1>Recurate</h1><p class="sub">Click a thumbnail to swap the picture above it. One search per piece, so the alternates are its siblings.</p>
<div class="bar"><button id="copy">Copy choices</button><span id="n"></span></div>
${body}
<script>
const slots=[...document.querySelectorAll('.slot')];
document.querySelectorAll('.alts img').forEach(t=>t.onclick=()=>{
  const main=t.closest('.slot').querySelector('.main img');
  const a=t.dataset.url, b=main.dataset.url;
  main.src=t.src; main.dataset.url=a; t.src=JSON.parse(b||'{}').thumbUrl||t.src; t.dataset.url=b;
});
document.getElementById('copy').onclick=async()=>{
  const o={};
  for(const s of slots){const m=s.querySelector('.main img');if(m.dataset.url)o[s.dataset.id]=JSON.parse(m.dataset.url);}
  await navigator.clipboard.writeText(JSON.stringify(o));
  document.getElementById('n').textContent='copied '+Object.keys(o).length+' choices';
};
</script>`;
}

const json = (m?: MediaItem): string => (m ? esc(JSON.stringify(m)) : "");
const esc = (s: string): string =>
    s.replace(
        /[<>&"']/g,
        (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
    );

await main();
process.exit(0);
