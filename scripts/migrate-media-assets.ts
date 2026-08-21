import "dotenv/config";
import { eq } from "drizzle-orm";

import { mediaRefs } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentColumns } from "@services/core/artifacts";
import { adoptable, syncArtifactAssets } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * One-time backfill for artifacts written before media was assetified.
 *
 *   pnpm media:migrate            report what would change
 *   pnpm media:migrate --write    adopt and rewrite
 *
 * Walks every artifact, live and trashed, adopts each foreign media url into the owning workspace's
 * library, rewrites the tree to canonical asset urls, and fills the reverse index. Idempotent: an
 * artifact already holding only canonical urls costs one read and is left byte-identical.
 */

const write = process.argv.includes("--write");

async function main(): Promise<void> {
    const rows = await db
        .select({
            id: schema.artifacts.id,
            workspaceId: schema.artifacts.workspaceId,
            title: schema.artifacts.title,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts);

    let touched = 0;
    let adopted = 0;
    let linked = 0;

    for (const row of rows) {
        // `adoptable` is the same test the write path uses, so a platform video link (which stays
        // a link by design) is never counted as work left to do
        const foreign = mediaRefs(row.draftContent).filter(adoptable);
        if (!write) {
            if (foreign.length) {
                touched++;
                adopted += foreign.length;
                out(`${row.title}: ${foreign.length} to adopt`);
            }
            continue;
        }
        const { columns, assetIds } = await contentColumns(row.workspaceId, row.draftContent, db);
        if (foreign.length) {
            await db.update(schema.artifacts).set(columns).where(eq(schema.artifacts.id, row.id));
            touched++;
            adopted += foreign.length;
        }
        await syncArtifactAssets(row.id, assetIds, db);
        linked += assetIds.length;
    }

    out("");
    out(
        write
            ? `rewrote ${touched} of ${rows.length} artifacts · adopted ${adopted} urls · ${linked} references indexed`
            : `${touched} of ${rows.length} artifacts hold ${adopted} foreign urls (dry run, pass --write)`,
    );
}

await main();
process.exit(0);
