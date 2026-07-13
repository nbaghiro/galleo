import { execSync } from "node:child_process";
import postgres from "postgres";

// Runs once before the integration suite: ensure the throwaway `galleo_test` DB exists and its schema is
// pushed. Self-contained so a fresh checkout / CI job (with Postgres up) just works.
export default async function setup(): Promise<void> {
    const url = process.env.DATABASE_URL ?? "postgres://galleo:galleo@localhost:8602/galleo_test";
    process.env.DATABASE_URL = url;

    // Create the test DB if missing (connect to the maintenance `galleo` DB; CREATE can't run in a txn).
    const dbName = new URL(url).pathname.slice(1);
    const adminUrl = url.replace(/\/[^/]+$/, "/galleo");
    const admin = postgres(adminUrl, { max: 1 });
    try {
        const [row] = await admin<{ exists: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists`;
        if (!row?.exists) await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    } finally {
        await admin.end();
    }

    // Push the schema to the test DB (drizzle.config reads DATABASE_URL). Additive on an empty DB → no prompt.
    execSync("pnpm exec drizzle-kit push --force", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: url },
    });
}
