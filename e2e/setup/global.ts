import { execSync } from "node:child_process";
import postgres from "postgres";
import { E2E_DB } from "@e2e/env";

// Mirror of services/__tests__/global-setup.ts, plus the real demo seed: the personas, pinned
// invite tokens and published-link slugs ARE the fixtures (see .docs/e2e-plan.md). Create-if-absent
// rather than drop: a locally reused server keeps pool connections open, and the seed is
// reseed-safe by design.
export default async function globalSetup(): Promise<void> {
    const dbName = new URL(E2E_DB).pathname.slice(1);
    const admin = postgres(E2E_DB.replace(/\/[^/]+$/, "/galleo"), { max: 1 });
    try {
        const [row] = await admin<{ exists: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists`;
        if (!row?.exists) await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    } finally {
        await admin.end();
    }
    const target = postgres(E2E_DB, { max: 1 });
    try {
        await target.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
    } finally {
        await target.end();
    }
    const env = { ...process.env, DATABASE_URL: E2E_DB };
    execSync("pnpm exec drizzle-kit push --force", { stdio: "inherit", env });
    execSync("pnpm seed", { stdio: "inherit", env });
}
