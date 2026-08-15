import { sql } from "drizzle-orm";
import { db } from "@services/db/client";

// Standalone so setupFiles can truncate without importing the router graph: pulling the routers in
// the setup phase would bind the real Stripe SDK before a test file's vi.mock registers.
export async function resetDb(): Promise<void> {
    const rows = (await db.execute(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )) as unknown as Array<{ tablename: string }>;
    const names = rows.map((r) => `"${r.tablename}"`);
    if (names.length)
        await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}
