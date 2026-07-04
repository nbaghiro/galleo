import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentEvent, GenerateInput } from "@model/agent";
import { eq } from "drizzle-orm";
import { db, schema } from "../data/client";
import { runGenerate } from "./pipeline";
import type { DirectionT, OutlineT, PlanBeatT, SectionContentT, SectionElementT } from "./pipeline";
import type { Quality } from "./llm";

// One-off generation harness for debugging the prompts — the real pipeline (plan → write → images →
// ArtifactContent), NOT the app's client-side simulator. Prints the raw LLM IR (what you tune the
// prompts against), writes the artifact JSON to .gen/, and — if the DB is up — saves it so it opens in
// the editor.
//
//   pnpm agent:gen "an investor pitch deck for a specialty coffee subscription"
//   GALLEO_SURFACE=web GALLEO_THEME=carbon GALLEO_QUALITY=best pnpm agent:gen "…"

const q = process.env.GALLEO_QUALITY;
const quality: Quality = q === "auto" || q === "best" || q === "fast" ? q : "balanced";
const brief: GenerateInput = {
    prompt:
        process.argv.slice(2).join(" ") ||
        "An investor pitch deck for a specialty coffee subscription startup",
    surface: (process.env.GALLEO_SURFACE as GenerateInput["surface"]) || "deck",
    theme: process.env.GALLEO_THEME || "studio",
};

const w = (s = ""): void => void process.stdout.write(`${s}\n`);
const pad = (s: string, n: number): string => s.padEnd(n).slice(0, n);

// Compact one-line view of a raw element IR — the copy the writer actually produced.
function fmtElement(e: SectionElementT): string {
    const head = `[${e.cell ?? "?"}] ${e.kind}${e.level ? ` ${e.level}` : ""}${e.lead ? " lead" : ""}`;
    const body =
        e.kind === "bullets"
            ? (e.items ?? []).map((i) => `• ${i}`).join("  ")
            : e.kind === "stat"
              ? `${e.value ?? ""} — ${e.label ?? ""}`
              : e.kind === "image"
                ? `⟨img: ${e.query ?? "?"}⟩`
                : e.kind === "quote"
                  ? `"${e.text ?? ""}" — ${e.by ?? ""}`
                  : (e.text ?? "");
    return `    ${pad(head, 22)} ${body}`;
}

function printEvent(e: AgentEvent): void {
    if (e.type === "narration") w(`  · ${e.text}${e.mono ?? ""}${e.sub ? `  — ${e.sub}` : ""}`);
    else if (e.type === "error") w(`\n✗ ${e.message}`);
}

async function saveToEditor(title: string, content: GenerateResultContent): Promise<string | null> {
    const [ws] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, "demo"));
    if (!ws) return null;
    const [row] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId: ws.id,
            title,
            formatId: content.format,
            themeId: content.theme,
            draftContent: content,
            createdBy: ws.ownerId,
        })
        .returning({ id: schema.artifacts.id });
    return row ? `http://localhost:8600/app/edit/${row.id}` : null;
}
type GenerateResultContent = Awaited<ReturnType<typeof runGenerate>>["content"];

async function main(): Promise<void> {
    const start = Date.now();
    w(`▸ brief`);
    w(`  "${brief.prompt}"  ·  ${brief.surface} · ${brief.theme} · quality=${quality}\n`);

    let outline: OutlineT | null = null;
    const sectionIR = new Map<string, SectionContentT>();
    const result = await runGenerate(brief, printEvent, {
        quality,
        debug: {
            direction: (d: DirectionT) => {
                w(`\n▸ direction`);
                w(`  subject : ${d.subject}`);
                w(`  world   : ${d.world}`);
                w(`  audience: ${d.audience}`);
                w(`  tone    : ${d.tone}`);
                w(`  art dir : ${d.artDirection}`);
            },
            outline: (o: OutlineT) => {
                outline = o;
                w(`\n▸ outline: "${o.title}"`);
                o.beats.forEach((b: PlanBeatT) =>
                    w(
                        `  ${pad(b.id, 4)}${pad(b.role, 9)}${pad(b.grid, 12)}${b.image ? "📷 " : "   "}${b.headline}  — ${b.intent}`,
                    ),
                );
            },
            section: (beat: PlanBeatT, content: SectionContentT) => sectionIR.set(beat.id, content),
        },
    });

    // Ordered dump of the raw IR — concurrent writes arrive out of order, so print in outline order.
    // This is the surface you tune the prompts against: empty headings / stats jump out here.
    w(`\n▸ sections (raw IR the writer returned)`);
    for (const b of (outline as OutlineT | null)?.beats ?? []) {
        w(`  ${b.id}  ${b.headline}`);
        (sectionIR.get(b.id)?.elements ?? []).forEach((el: SectionElementT) => w(fmtElement(el)));
    }

    const secs = ((Date.now() - start) / 1000).toFixed(1);
    w(`\n✓ "${result.title}" — ${result.content.sections.length} sections in ${secs}s`);

    // Always write the JSON (inspect / diff prompt runs), even with no DB.
    const dir = resolve(process.cwd(), ".gen");
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `gen-${start}.json`);
    writeFileSync(file, JSON.stringify({ title: result.title, content: result.content }, null, 2));
    w(`json   → ${file}`);

    try {
        const url = await saveToEditor(result.title, result.content);
        w(url ? `editor → ${url}` : `editor → (no demo workspace — run \`pnpm seed\` to enable)`);
    } catch (err) {
        w(`editor → (DB unavailable: ${String(err)})`);
    }
    process.exit(0);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
