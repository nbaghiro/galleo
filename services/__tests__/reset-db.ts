import { sql } from "drizzle-orm";
import { db } from "../schema";

// Standalone so setupFiles can truncate WITHOUT importing the router graph (harness.ts). Pulling the
// routers in the setup phase would evaluate services/billing/stripe.ts before a test file's vi.mock
// registers, binding the real Stripe SDK and defeating the mock. Keep this dependency-light.
export async function resetDb(): Promise<void> {
    const rows = (await db.execute(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )) as unknown as Array<{ tablename: string }>;
    const names = rows.map((r) => `"${r.tablename}"`);
    if (names.length)
        await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}
