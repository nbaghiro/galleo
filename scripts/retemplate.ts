import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { MediaItem } from "@model/media";
import { TEMPLATE_INDEX } from "@model/templates";
import { searchStock } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * Sources the template catalogue's photography, one photograph per call site.
 *
 *   pnpm tsx scripts/retemplate.ts            brief, search, write a picker
 *   pnpm tsx scripts/retemplate.ts --write    apply CHOICES back into the source
 *
 * Everything runs against the source text rather than the built bodies, so the context a photograph
 * was chosen from and the call site it is written back to are the same position in the same string.
 *
 * The former picsum ids were shared: 172 of 347 photographs served more than one template, which is
 * why a single id could not be relevant to the content around it. Each call site now gets its own id.
 */

const write = process.argv.includes("--write");
const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;
const SCRATCH = process.env.SHEET_DIR ?? "/tmp/retemplate";
const SRC = "services/core/templates.ts";

type Role = "background" | "avatar" | "photo";

interface Slot {
    at: number; // index in the source of the pic( call
    old: number;
    size: string; // ", 1700, 1100" or ""
    body: string; // the `export const <body>` this call sits in
    name: string;
    category: string;
    section: number;
    role: Role;
    text: string;
    query?: string;
    pick?: MediaItem;
    alternates: MediaItem[];
}

const STYLE = new Set([
    "h1",
    "h2",
    "h3",
    "label",
    "subtitle",
    "caption",
    "body",
    "quote",
    "eyebrow",
]);

function parse(src: string): Slot[] {
    const regions = [...src.matchAll(/export const (\w+): ArtifactContent/g)].map((m) => ({
        body: m[1]!,
        at: m.index,
    }));
    // BODIES is the only place a body is tied to its catalogue id, and some entries are shorthand
    const bodiesAt = src.indexOf("const BODIES");
    const idOf = new Map<string, string>();
    for (const m of src.slice(bodiesAt).matchAll(/^\s*(?:"([^"]+)":\s*)?(\w+),$/gm))
        idOf.set(m[2]!, m[1] ?? m[2]!);
    const entry = new Map(TEMPLATE_INDEX.map((e) => [e.id, e]));

    const sections = [...src.matchAll(/\bsection\(/g)].map((m) => m.index);
    // a TS string literal holds no raw newline, so excluding one keeps the match from running past a
    // closing quote and capturing the code between two strings
    const strings = [...src.matchAll(/"((?:[^"\\\n]|\\.){4,})"/g)];

    const slots: Slot[] = [];
    for (const m of src.matchAll(/\bpic\((\d+)((?:,\s*\d+)*)\)/g)) {
        const at = m.index;
        const region = regions.filter((r) => r.at < at).at(-1);
        if (!region) continue;
        const meta = entry.get(idOf.get(region.body) ?? "");

        const start = sections.filter((s) => s < at).at(-1) ?? region.at;
        const stop = sections.find((s) => s > at) ?? src.length;
        const ordinal = sections.filter((s) => s >= region.at && s <= start).length - 1;
        const text = strings
            .filter((s) => s.index > start && s.index < stop && !STYLE.has(s[1]!))
            .map((s) => s[1]!)
            .filter((t) => t.includes(" "))
            .slice(0, 7)
            .join(" / ")
            .slice(0, 300);

        // a circular crop is an avatar slot; a bgImage argument is the section's backdrop
        const bg = src.lastIndexOf("bgImage(", at);
        const im = src.lastIndexOf("img(", at);
        const tail = /^,\s*[\d.]+,\s*(\d+)\s*\)/.exec(src.slice(at + m[0].length));
        const role: Role =
            bg > im && at - bg < 24
                ? "background"
                : Number(tail?.[1] ?? 0) >= 100
                  ? "avatar"
                  : "photo";

        slots.push({
            at,
            old: Number(m[1]),
            size: m[2] ?? "",
            body: region.body,
            name: meta?.name ?? region.body,
            category: meta?.category ?? "",
            section: ordinal,
            role,
            text,
            alternates: [],
        });
    }
    return slots;
}

const BRIEF = z.object({
    slots: z.array(z.object({ i: z.number(), query: z.string() })),
});

/**
 * The queries are written by a model rather than derived from the template's name, which is what
 * produced one concept repeated down a whole piece: the name says "Startup Pitch Deck" while the
 * content is a restaurant business, so every section got generic startup imagery.
 */
async function brief(name: string, category: string, group: Slot[]): Promise<void> {
    const listed = group
        .map((s, i) => `${i}. [${s.role}] section ${s.section}: ${s.text || "(no copy)"}`)
        .join("\n");
    const { object } = await generateObject({
        model: anthropic("claude-fable-5"),
        schema: BRIEF,
        prompt: `Choosing stock photography for one document template.

Template: ${name} (${category})
Slots:
${listed}

Write a Pexels search query of three to six words for each slot.

Rules:
- Beauty first. The query should return a photograph worth looking at: real scenes, natural or
  directional light, depth, a composition that holds up at full bleed.
- Read the copy and pick a subject that belongs to what the section is actually about, including the
  industry the piece is in, not the generic category the template name suggests.
- Vary the subject across slots. The same concept repeated down a piece is the failure to avoid.
- No photographs of screens, dashboards, laptops or code, and none of the handshake, whiteboard,
  sticky-note or thumbs-up stock cliches.
- [background] slots sit behind text under a dark scrim, so ask for something atmospheric and open,
  with room for type and no busy focal point.
- [avatar] slots are circular headshots: ask for a portrait of one person in natural light.

Return one entry per slot, keyed by its number.`,
    });
    for (const { i, query } of object.slots) if (group[i]) group[i]!.query = query;
}

/**
 * Fills the slots a previous pass left empty, at a pace Pexels will serve.
 *
 * The monthly quota in the response headers is not the binding limit: a run of 688 back-to-back
 * searches filled its first 24 templates and then returned nothing for the rest, while the monthly
 * counter never moved, so the refusals were an hourly cap that the headers do not report. Resumable
 * and idempotent, because at this pace a full fill runs for hours.
 */
async function fill(): Promise<void> {
    const slots: Slot[] = JSON.parse(readFileSync(`${SCRATCH}/slots.json`, "utf8"));
    const claimed = new Set(slots.flatMap((s) => (s.pick ? [s.pick.url] : [])));
    const todo = slots.filter((s) => !s.pick && s.query);
    out(`${todo.length} slots to fill, ${claimed.size} photos already claimed`);

    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    let done = 0;
    let backoff = 0;
    for (const s of todo) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const orientation = s.role === "avatar" ? "portrait" : "landscape";
            const r = await searchStock("pexels", s.query!, 1, orientation, "photo").catch(
                () => null,
            );
            const pool = (r?.items ?? []).filter(
                (m) => !/pexels|watermark|logo/i.test(m.alt ?? ""),
            );
            if (pool.length) {
                const pick = pool.find((m) => !claimed.has(m.url)) ?? pool[0];
                if (pick) claimed.add(pick.url);
                s.pick = pick;
                s.alternates = pool.filter((m) => m.url !== pick?.url).slice(0, 11);
                backoff = Math.max(0, backoff - 1);
                break;
            }
            // an empty pool for a query that reads fine is the cap, not the query
            backoff += 1;
            await wait(Math.min(15 * 60_000, 30_000 * 2 ** Math.min(backoff, 5)));
        }
        done += 1;
        if (done % 10 === 0) {
            writeFileSync(`${SCRATCH}/slots.json`, JSON.stringify(slots, null, 2));
            out(`  ${done}/${todo.length} filled (${slots.filter((x) => x.pick).length} total)`);
        }
        await wait(Number(process.env.FILL_DELAY_MS ?? 18_000));
    }
    writeFileSync(`${SCRATCH}/slots.json`, JSON.stringify(slots, null, 2));
    writeFileSync(`${SCRATCH}/index.html`, picker(slots));
    out(`\n${slots.filter((s) => s.pick).length}/${slots.length} filled`);
}

async function main(): Promise<void> {
    if (write) return apply();
    if (process.argv.includes("--fill")) return fill();

    const src = readFileSync(SRC, "utf8");
    const all = parse(src);
    out(`${all.length} call sites across ${new Set(all.map((s) => s.body)).size} templates`);
    const roles = all.reduce<Record<string, number>>(
        (a, s) => ({ ...a, [s.role]: (a[s.role] ?? 0) + 1 }),
        {},
    );
    out(`roles: ${JSON.stringify(roles)}`);
    if (process.argv.includes("--dry")) {
        for (const s of all.filter((x) => x.name === (only ?? "Startup Pitch Deck")))
            out(`  s${String(s.section).padStart(2)} ${s.role.padEnd(10)} ${s.text.slice(0, 92)}`);
        return;
    }

    const prior: Slot[] = only ? JSON.parse(readFileSync(`${SCRATCH}/slots.json`, "utf8")) : [];
    const keep = prior.filter((s) => !s.name.includes(only ?? " "));
    const claimed = new Set(keep.flatMap((s) => (s.pick ? [s.pick.url] : [])));

    const groups = new Map<string, Slot[]>();
    for (const s of all) (groups.get(s.body) ?? groups.set(s.body, []).get(s.body)!).push(s);

    const done: Slot[] = [...keep];
    let i = 0;
    for (const [, group] of groups) {
        i += 1;
        const { name, category } = group[0]!;
        if (only && !name.includes(only)) continue;
        try {
            await brief(name, category, group);
        } catch (e) {
            out(`  brief failed for ${name}: ${String(e).slice(0, 80)}`);
        }
        for (const s of group) {
            const q = s.query ?? `${name} ${category}`;
            const orientation = s.role === "avatar" ? "portrait" : "landscape";
            const r = await searchStock("pexels", q, 1, orientation, "photo").catch(() => null);
            const pool = (r?.items ?? []).filter(
                (m) => !/pexels|watermark|logo/i.test(m.alt ?? ""),
            );
            const pick = pool.find((m) => !claimed.has(m.url));
            if (pick) claimed.add(pick.url);
            s.pick = pick;
            s.alternates = pool.filter((m) => m.url !== pick?.url).slice(0, 11);
            done.push(s);
        }
        out(
            `  ${String(i).padStart(2)}/${groups.size}  ${String(group.length).padStart(2)} slots  ${name}`,
        );
    }

    done.sort((a, b) => a.at - b.at);
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}/slots.json`, JSON.stringify(done, null, 2));
    writeFileSync(`${SCRATCH}/index.html`, picker(done));
    out(
        `\n${done.filter((s) => s.pick).length}/${done.length} filled, picker at ${SCRATCH}/index.html`,
    );
}

/**
 * Renumbers every call site so an id belongs to exactly one photograph, then writes the map. Parse
 * and rewrite read the same string, so a slot's context and its call site cannot drift apart.
 */
function apply(): void {
    const chosen = JSON.parse(readFileSync(process.env.CHOICES!, "utf8")) as Record<
        string,
        MediaItem
    >;
    const src = readFileSync(SRC, "utf8");
    const slots = parse(src);

    const lines: string[] = [];
    let seen = "";
    let built = "";
    let cursor = 0;
    slots.forEach((s, i) => {
        const id = i + 1;
        const m = chosen[String(s.at)];
        if (!m) throw new Error(`no photo chosen for call site at ${s.at} (${s.name})`);
        if (s.name !== seen) {
            lines.push(`    // ${s.name}`);
            seen = s.name;
        }
        lines.push(`    ${id}: ${JSON.stringify(m.url.split("?")[0])},`);
        const end = src.indexOf(")", s.at) + 1;
        built += src.slice(cursor, s.at) + `pic(${id}${s.size})`;
        cursor = end;
    });
    built += src.slice(cursor);

    const helper = `// One entry per call site, chosen for the copy around it. Pexels rather than Unsplash: its licence
// lets us hold the bytes when template imagery moves to our own storage, and it asks for no credit.
const PHOTOS: Record<number, string> = {
${lines.join("\n")}
};
const pic = (id: number, w = 1100, h = 900): string => {
    const base = PHOTOS[id];
    return base ? \`\${base}?auto=compress&cs=tinysrgb&fit=crop&w=\${w}&h=\${h}\` : "";
};`;
    const current = /\/\/ One entry per[\s\S]*?^};$\n^const pic = [\s\S]*?^};$/m;
    const legacy = /\/\/ Template photography[\s\S]*?^};$\n^const pic = [\s\S]*?^};$/m;
    const next = current.test(built)
        ? built.replace(current, helper)
        : built.replace(legacy, helper);
    if (next === built) throw new Error("pic() helper not found in either expected shape");
    writeFileSync(SRC, next);
    out(`rewrote ${slots.length} call sites into ${SRC}`);
}

function picker(slots: Slot[]): string {
    const groups = new Map<string, Slot[]>();
    for (const s of slots) (groups.get(s.name) ?? groups.set(s.name, []).get(s.name)!).push(s);
    const body = [...groups]
        .map(
            ([t, rows]) =>
                `<section><h2>${esc(t)}</h2><div class="grid">${rows
                    .map(
                        (s) => `<div class="slot" data-at="${s.at}">
      <div class="main"><img loading="lazy" src="${s.pick?.thumbUrl ?? ""}" data-url='${json(s.pick)}'></div>
      <div class="cap"><b>${s.role}</b> ${esc(s.query ?? "")}</div>
      <div class="ctx">${esc(s.text.slice(0, 110))}</div>
      <div class="alts">${s.alternates.map((a) => `<img loading="lazy" src="${a.thumbUrl}" data-url='${json(a)}'>`).join("")}</div></div>`,
                    )
                    .join("")}</div></section>`,
        )
        .join("\n");
    return `<!doctype html><meta charset="utf-8"><title>Template photography</title>
<style>:root{color-scheme:light dark}body{margin:0;padding:20px;font:13px/1.5 system-ui;background:#f6f5f2;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}
h1{font:600 20px/1.2 system-ui;margin:0 0 4px}h2{font:600 14px/1.3 system-ui;margin:26px 0 8px}
.bar{position:sticky;top:0;z-index:5;background:inherit;padding:10px 0;border-bottom:1px solid #8884;display:flex;gap:10px;align-items:center}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.slot{border:1px solid #8883;border-radius:10px;overflow:hidden;background:#fff2}
.main img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block;background:#8882}
.cap{padding:5px 8px 2px;font-size:11px}.ctx{padding:0 8px 6px;font-size:10px;opacity:.55}
.alts{display:flex;gap:3px;padding:0 6px 8px;overflow-x:auto}
.alts img{width:40px;height:30px;object-fit:cover;border-radius:4px;cursor:pointer;opacity:.6;flex:0 0 auto}
.alts img:hover{opacity:1;outline:2px solid #c0392b}</style>
<h1>Template photography</h1><p>One photograph per call site, briefed from the copy beside it. Click a thumbnail to swap.</p>
<div class="bar"><button id="copy">Copy choices</button><span id="n"></span></div>
${body}
<script>
document.querySelectorAll('.alts img').forEach(t=>t.onclick=()=>{const m=t.closest('.slot').querySelector('.main img');const a=t.dataset.url,b=m.dataset.url;m.src=t.src;m.dataset.url=a;t.src=JSON.parse(b||'{}').thumbUrl||t.src;t.dataset.url=b;});
document.getElementById('copy').onclick=async()=>{const o={};document.querySelectorAll('.slot').forEach(s=>{const m=s.querySelector('.main img');if(m.dataset.url)o[s.dataset.at]=JSON.parse(m.dataset.url);});await navigator.clipboard.writeText(JSON.stringify(o));document.getElementById('n').textContent='copied '+Object.keys(o).length;};
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
