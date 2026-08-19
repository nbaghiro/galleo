import { execSync } from "node:child_process";
import postgres from "postgres";

export default async function setup(): Promise<void> {
    // Must resolve the same name vitest.integration.config.ts does: globalSetup runs before the
    // workers and never sees the config's `env`, so reading DATABASE_URL alone would create the
    // default database while the tests connect to the GALLEO_TEST_DB one and find nothing there.
    const url =
        process.env.DATABASE_URL ??
        `postgres://galleo:galleo@localhost:8602/${process.env.GALLEO_TEST_DB ?? "galleo_test"}`;
    process.env.DATABASE_URL = url;

    // CREATE DATABASE can't run in a transaction
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

    // push can create tables but not extensions, and chunks.embedding needs the vector type
    const target = postgres(url, { max: 1 });
    try {
        await target.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
    } finally {
        await target.end();
    }

    // converges the schema on every run; the DB may persist across runs (GALLEO_TEST_DB),
    // and --force skips the prompt — destructive convergence is fine on a throwaway test DB
    execSync("pnpm exec drizzle-kit push --force", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: url },
    });
}
