import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { artifactDigest, artifactSearchText } from "@model/digest";
import { db, schema } from "../services/schema";
import { out } from "../services/log";

// One-shot backfill of artifacts.search_text + artifacts.digest for rows written before the search
// index existed (search_tsv is a generated column, so filling the text is all it needs). Idempotent:
// --all recomputes every row, e.g. after changing the extractor; otherwise only unindexed rows.

const BATCH = 200;

async function main(): Promise<void> {
    const all = process.argv.includes("--all");
    let done = 0;
    for (;;) {
        const rows = await db
            .select({ id: schema.artifacts.id, draftContent: schema.artifacts.draftContent })
            .from(schema.artifacts)
            .where(all ? undefined : isNull(schema.artifacts.searchText))
            .limit(BATCH)
            .offset(all ? done : 0);
        if (!rows.length) break;
        for (const row of rows)
            await db
                .update(schema.artifacts)
                .set({
                    digest: artifactDigest(row.draftContent),
                    searchText: artifactSearchText(row.draftContent),
                })
                .where(eq(schema.artifacts.id, row.id));
        done += rows.length;
        out(`  indexed ${done}`);
        if (rows.length < BATCH) break;
    }
    out(`✓ backfilled ${done} artifacts`);
    process.exit(0);
}

void main();
