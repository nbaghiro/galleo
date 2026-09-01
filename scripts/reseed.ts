import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { searchStock } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * Replaces the last picsum seeds with real photographs.
 *
 *   pnpm tsx scripts/reseed.ts            search and write a review sheet
 *   pnpm tsx scripts/reseed.ts --write    apply
 *
 * `img("slug")` and `bgImage("slug")` fall through to a picsum seed url when the argument is not
 * already a url. picsum has been down since 2026-08-29, so every one of these renders blank, which
 * is what fails the headless capture test on CI: the eval corpus is the fixture it shoots.
 *
 * Temporary, like repicsum.ts and recurate.ts. Delete once the seeds are gone.
 */

const write = process.argv.includes("--write");
const SHEET = process.env.SHEET_DIR ?? "/tmp/reseed";

const FILES = [
    "services/core/ai/corpus/galleo.ts",
    "services/core/ai/corpus/aria.ts",
    "services/core/ai/corpus/lumen.ts",
    "services/core/ai/corpus/terra.ts",
    "services/core/ai/corpus/slowweb.ts",
    "services/core/ai/corpus/fieldnotes.ts",
    "canvas/render/__tests__/richdoc.testkit.ts",
    "app/views/theme-demo.ts",
    "services/core/designs.ts",
    "model/__tests__/authoring.test.ts",
];

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

interface Slot {
    file: string;
    seed: string;
    role: "background" | "photo";
    text: string;
    query?: string;
    url?: string;
}

function parse(file: string): Slot[] {
    const src = readFileSync(file, "utf8");
    // a TS string literal holds no raw newline, so excluding one stops a match running past a quote
    const strings = [...src.matchAll(/"((?:[^"\\\n]|\\.){4,})"/g)];
    const slots: Slot[] = [];
    for (const m of src.matchAll(/\b(img|bgImage)\(\s*"([^"]+)"/g)) {
        const seed = m[2]!;
        if (seed.startsWith("http")) continue;
        const at = m.index;
        const text = strings
            .filter((s) => Math.abs(s.index - at) < 1400 && !STYLE.has(s[1]!) && s[1] !== seed)
            .map((s) => s[1]!)
            .filter((t) => t.includes(" "))
            .slice(0, 6)
            .join(" / ")
            .slice(0, 260);
        slots.push({ file, seed, role: m[1] === "bgImage" ? "background" : "photo", text });
    }
    return slots;
}

const BRIEF = z.object({ slots: z.array(z.object({ i: z.number(), query: z.string() })) });

async function brief(file: string, group: Slot[]): Promise<void> {
    const listed = group
        .map((s, i) => `${i}. [${s.role}] ${s.seed}: ${s.text || "(no copy)"}`)
        .join("\n");
    const { object } = await generateObject({
        model: anthropic("claude-fable-5"),
        schema: BRIEF,
        prompt: `Choosing stock photography for a sample document used as a rendering fixture.

File: ${file}
Slots (the seed name says what the image was meant to show):
${listed}

Write a Pexels search query of three to six words for each slot.

Rules:
- Beauty first: real scenes, natural or directional light, depth, a composition that holds at full bleed.
- Read the seed name and the copy, and pick a subject that belongs to what the section is about.
- Vary the subject across slots. One concept repeated down a piece is the failure to avoid.
- No photographs of screens, dashboards, laptops or code, and no handshake or whiteboard cliches.
- [background] slots sit behind text under a scrim: atmospheric and open, no busy focal point.

Return one entry per slot, keyed by its number.`,
    });
    for (const { i, query } of object.slots) if (group[i]) group[i]!.query = query;
}

async function main(): Promise<void> {
    const all = FILES.flatMap(parse);
    out(`${all.length} seeds across ${FILES.length} files`);

    if (write) {
        const chosen = JSON.parse(readFileSync(`${SHEET}/slots.json`, "utf8")) as Slot[];
        const byFile = new Map<string, Slot[]>();
        for (const s of chosen) (byFile.get(s.file) ?? byFile.set(s.file, []).get(s.file)!).push(s);
        for (const [file, group] of byFile) {
            let src = readFileSync(file, "utf8");
            for (const s of group) {
                if (!s.url) continue;
                const re = new RegExp(
                    `(\\b(?:img|bgImage)\\(\\s*)"${s.seed.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}"`,
                    "g",
                );
                src = src.replace(re, (_m, head: string) => `${head}${JSON.stringify(s.url)}`);
            }
            writeFileSync(file, src);
            out(
                `  ${group
                    .filter((s) => s.url)
                    .length.toString()
                    .padStart(2)}  ${file}`,
            );
        }
        return;
    }

    const claimed = new Set<string>();
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    for (const file of FILES) {
        const group = all.filter((s) => s.file === file);
        if (!group.length) continue;
        await brief(file, group).catch((e) => out(`  brief failed: ${String(e).slice(0, 70)}`));
        for (const s of group) {
            const r = await searchStock(
                "pexels",
                s.query ?? s.seed.replace(/-/g, " "),
                1,
                "landscape",
                "photo",
            ).catch(() => null);
            const pool = (r?.items ?? []).filter(
                (m) => !/pexels|watermark|logo/i.test(m.alt ?? ""),
            );
            const pick = pool.find((m) => !claimed.has(m.url));
            if (pick) {
                claimed.add(pick.url);
                s.url = `${pick.url.split("?")[0]}?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100`;
            }
            await wait(Number(process.env.FILL_DELAY_MS ?? 6000));
        }
        out(`  ${group.filter((s) => s.url).length}/${group.length}  ${file}`);
    }
    writeFileSync(`${SHEET}/slots.json`, JSON.stringify(all, null, 2));
    out(`\n${all.filter((s) => s.url).length}/${all.length} filled`);
}

await main();
process.exit(0);
