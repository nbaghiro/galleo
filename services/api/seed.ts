import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../data/client";
import { hashPassword } from "../auth/password";
import { DEMOS } from "../../surfaces/studio/demos";

// Idempotent seed: a demo user (with a password) + workspace + the demo decks. Run with `pnpm seed`.
const DEMO_EMAIL = "demo@galleo.app";
const DEMO_PASSWORD = "demo1234";

const log = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

async function seed(): Promise<void> {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
    if (!user) {
        [user] = await db.insert(schema.users).values({ email: DEMO_EMAIL, name: "Demo User" }).returning();
        log("• created demo user");
    }
    if (!user) throw new Error("failed to create demo user");
    // (re)set the demo password so login works after a schema change
    await db.update(schema.users).set({ passwordHash: hashPassword(DEMO_PASSWORD) }).where(eq(schema.users.id, user.id));

    let [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, "demo"));
    if (!ws) {
        [ws] = await db.insert(schema.workspaces).values({ name: "Demo Workspace", slug: "demo", ownerId: user.id }).returning();
        log("• created demo workspace");
    }
    if (!ws) throw new Error("failed to create workspace");

    const ms = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
    if (!ms.some((m) => m.workspaceId === ws.id)) {
        await db.insert(schema.members).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
    }

    // Reset the workspace's artifacts, then insert the demo decks fresh.
    await db.delete(schema.artifacts).where(eq(schema.artifacts.workspaceId, ws.id));
    for (const d of DEMOS) {
        await db.insert(schema.artifacts).values({
            workspaceId: ws.id,
            title: d.title,
            formatId: d.artifact.format,
            themeId: d.artifact.theme,
            draftContent: d.artifact,
            createdBy: user.id,
        });
    }
    log(`• seeded ${DEMOS.length} demo decks`);
    log(`\nLog in with:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
}

seed()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${String(e)}\n`);
        process.exit(1);
    });
