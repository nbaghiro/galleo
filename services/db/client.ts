import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

// The live handle. Kept apart from schema.ts so table shapes can be imported without opening a
// socket, and built without asserting the URL: postgres-js connects lazily, so an unconfigured
// handle is inert until something actually queries, and importing a module that touches the
// database never fails on its own. The entry points assert a real URL up front (server.ts,
// db/seed.ts), which is where a missing one should stop the process.
export const DATABASE_URL = process.env.DATABASE_URL ?? "";

export function assertDatabaseUrl(): void {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
}

// prepare:false: PgBouncer transaction mode rejects prepared statements; harmless on direct/local
export const db = drizzle(
    postgres(DATABASE_URL || "postgres://localhost:1/unset", { prepare: false }),
    {
        schema,
    },
);

/** A drizzle transaction handle, and the union for code that runs either inside one or on its own. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Db = typeof db | Tx;
