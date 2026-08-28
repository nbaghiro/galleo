import "dotenv/config";
import { eq } from "drizzle-orm";
import { LEGACY_MEDIA_KINDS, asContent, withMediaKinds } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentColumns } from "@services/core/artifacts";
import { out } from "@services/utils/env";

/**
 * One-time sweep for artifacts written before the media elements merged into one.
 *
 *   pnpm media:elements            report what would change
 *   pnpm media:elements --write    rewrite
 *
 * `image`, `gif`, `illustration`, `sticker`, `video`, `avatar`, `icon` and `graphic` all become
 * `media` carrying the kind they used to say in their type. Nothing renders differently: the old
 * types stay registered as palette variants and resolve through the same spec, so this is about
 * getting every stored tree onto one shape rather than about fixing anything visible. Idempotent,
 * and the write path applies the same pass, so an artifact saved since the merge is already done.
 */

const write = process.argv.includes("--write");

const legacyCount = (content: unknown): number => {
    let n = 0;
    const walk = (el: unknown): void => {
        if (!el || typeof el !== "object") return;
        const { type, data } = el as { type?: string; data?: Record<string, unknown> };
        if (type && LEGACY_MEDIA_KINDS[type]) n += 1;
        for (const v of Object.values(data ?? {}))
            if (Array.isArray(v)) for (const kid of v) walk(kid);
    };
    for (const s of asContent(content).sections) walk(s.root);
    return n;
};

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
    let elements = 0;
    for (const row of rows) {
        const n = legacyCount(row.draftContent);
        touched += n ? 1 : 0;
        elements += n;
        if (!write) {
            if (n) out(`${row.title}: ${n} to merge`);
            continue;
        }
        // written unconditionally: the digest is derived from the tree, and the cover reads the
        // media element, so a row already merged still needs its derivations refreshed once
        const merged = withMediaKinds(asContent(row.draftContent));
        const { columns } = await contentColumns(row.workspaceId, merged, db);
        await db.update(schema.artifacts).set(columns).where(eq(schema.artifacts.id, row.id));
    }

    out("");
    out(
        write
            ? `rewrote ${rows.length} artifacts · ${elements} elements merged`
            : `${touched} of ${rows.length} artifacts hold ${elements} legacy media elements (dry run, pass --write)`,
    );
}

await main();
process.exit(0);
