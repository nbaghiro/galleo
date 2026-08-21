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

    // Converges the schema on every run; the DB may persist across runs (GALLEO_TEST_DB).
    // `--force` only waves through data loss, not a column drizzle cannot place: a rename it cannot
    // tell from a create still asks, and with no one there to answer it waits forever. Stdin is
    // closed and the run is bounded so that shows up as a failure, and a test database is
    // disposable, so the answer to a stale one is to throw it away rather than to converge it.
    if (!push(url)) {
        await recreate(adminUrl, dbName);
        if (!push(url)) throw new Error(`could not converge the schema on ${dbName}`);
    }
}

// a healthy push is a few seconds; this only has to outlast a slow machine, and overshooting it
// costs a throwaway database rather than anything real
const PUSH_TIMEOUT_MS = 60_000;

function push(url: string): boolean {
    try {
        execSync("pnpm exec drizzle-kit push --force", {
            stdio: ["ignore", "inherit", "inherit"],
            timeout: PUSH_TIMEOUT_MS,
            env: { ...process.env, DATABASE_URL: url },
        });
        return true;
    } catch {
        return false;
    }
}

async function recreate(adminUrl: string, dbName: string): Promise<void> {
    const admin = postgres(adminUrl, { max: 1 });
    try {
        // FORCE closes any connection a killed run left behind
        await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
        await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    } finally {
        await admin.end();
    }
    const fresh = postgres(adminUrl.replace(/\/[^/]+$/, `/${dbName}`), { max: 1 });
    try {
        await fresh.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
    } finally {
        await fresh.end();
    }
}
