import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { collectableAssets } from "@services/core/media";
import { out } from "@services/utils/env";

/**
 * Reports stored media nothing references any more, and deletes it when told to.
 *
 *   pnpm media:collect                    every workspace, dry run
 *   pnpm media:collect --days 60          only what has sat unused that long (default 30)
 *   pnpm media:collect --write            actually delete
 *
 * Mostly this is generation takes nobody picked: every variation is stored and charged against the
 * cap the moment it streams in. Deliberately manual and dry by default, because the cost of a wrong
 * predicate here is someone's media, and `artifact_assets` is the only thing standing between the
 * two. Adopted rows are never candidates: they hold no bytes, so keeping them is free.
 */

const arg = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
};
const write = process.argv.includes("--write");
const days = Number(arg("--days") ?? 30);
const mb = (n: number): string => `${(n / (1024 * 1024)).toFixed(1)} MB`;

async function main(): Promise<void> {
    if (!Number.isFinite(days) || days < 0) throw new Error("--days must be a number");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const workspaces = await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaces);

    let total = 0;
    let freed = 0;
    for (const ws of workspaces) {
        const rows = await collectableAssets(ws.id, cutoff);
        if (!rows.length) continue;
        const bytes = rows.reduce((n, r) => n + (r.bytes ?? 0), 0);
        total += rows.length;
        freed += bytes;
        out(`${ws.name}: ${rows.length} unused (${mb(bytes)})`);
        if (write) {
            await db.delete(schema.assets).where(
                inArray(
                    schema.assets.id,
                    rows.map((r) => r.id),
                ),
            );
        }
    }

    out("");
    out(
        total === 0
            ? `nothing unused older than ${days} days`
            : write
              ? `deleted ${total} assets, freeing ${mb(freed)}`
              : `${total} assets holding ${mb(freed)} are unused (dry run, pass --write)`,
    );
}

await main();
process.exit(0);
