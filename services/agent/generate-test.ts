import "dotenv/config";
import type { AgentEvent, GenerateInput } from "@protocol/agent";
import { eq } from "drizzle-orm";
import { db, schema } from "../data/client";
import { runGenerate } from "./pipeline";
import type { Quality } from "./models";

// End-to-end pipeline test: `pnpm agent:gen [prompt…]` (env: GALLEO_SURFACE, GALLEO_THEME, GALLEO_QUALITY).
// Runs a generate turn, streams the events, then saves the artifact to the demo workspace so it opens in
// the editor.
const q = process.env.GALLEO_QUALITY;
const quality: Quality = q === "auto" || q === "best" || q === "fast" ? q : "balanced";
const brief: GenerateInput = {
    prompt:
        process.argv.slice(2).join(" ") ||
        "An investor pitch deck for a specialty coffee subscription startup",
    surface: (process.env.GALLEO_SURFACE as GenerateInput["surface"]) || "deck",
    theme: process.env.GALLEO_THEME || "studio",
};

const w = (s: string): void => void process.stdout.write(`${s}\n`);

function printEvent(e: AgentEvent): void {
    switch (e.type) {
        case "phase":
            w(`\n▸ ${e.name}`);
            break;
        case "plan":
            w(`  plan: ${e.beats.map((b) => `${b.id}(${b.role})`).join(" ")}`);
            break;
        case "narration":
            w(`  · ${e.text}${e.mono ?? ""}${e.sub ? `  — ${e.sub}` : ""}`);
            break;
        case "section.status":
            w(`    [${e.id}] ${e.status}`);
            break;
        case "patch":
            w(`    + ${e.ops.length} op`);
            break;
        case "turn.done":
            w(`\n✓ ${e.summary}`);
            break;
        case "error":
            w(`\n✗ ${e.message}`);
            break;
    }
}

async function main(): Promise<void> {
    const start = Date.now();
    w(`generate (${quality}) · ${brief.surface} · "${brief.prompt}"`);
    const result = await runGenerate(brief, printEvent, { quality });
    w(
        `\n"${result.title}" — ${result.content.sections.length} sections in ${((Date.now() - start) / 1000).toFixed(1)}s`,
    );

    const [ws] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, "demo"));
    if (!ws) {
        w("(no demo workspace — run `pnpm seed` first to save it)");
        process.exit(0);
    }
    const [row] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId: ws.id,
            title: result.title,
            formatId: result.content.format,
            themeId: result.content.theme,
            draftContent: result.content,
            createdBy: ws.ownerId,
        })
        .returning({ id: schema.artifacts.id });
    w(`saved → http://localhost:8600/app/edit/${row?.id}`);
    process.exit(0);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
