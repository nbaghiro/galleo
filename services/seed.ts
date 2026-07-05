import "dotenv/config";
import type { ArtifactContent } from "@model/artifact";
import { eq } from "drizzle-orm";
import { db, schema } from "./schema";
import { hashPassword } from "./auth";
import { TEMPLATES } from "./templates";
import { aria } from "./demos/aria";
import { fieldnotes } from "./demos/fieldnotes";
import { galleo } from "./demos/galleo";
import { helios } from "./demos/helios";
import { lumen } from "./demos/lumen";
import { slowweb } from "./demos/slowweb";
import { terra } from "./demos/terra";

// The seed demos — 7 fully-authored artifacts (deck / doc / web), one file each under demos/. Each ships
// its own theme + a real narrative so the demo library exercises the editor, themes, and every format
// with comprehensive, image-rich content. (These are seed content, not test fixtures.)
interface Demo {
    id: string;
    title: string;
    artifact: ArtifactContent;
}
const DEMOS: Demo[] = [
    { id: "galleo", title: "Galleo — Seed deck", artifact: galleo },
    { id: "aria", title: "Aria — Album launch", artifact: aria },
    { id: "terra", title: "Terra — Brand site", artifact: terra },
    { id: "lumen", title: "Lumen — Product launch", artifact: lumen },
    { id: "slowweb", title: "The Slow Web — Essay", artifact: slowweb },
    { id: "helios", title: "Helios — Climate report", artifact: helios },
    { id: "fieldnotes", title: "Field Notes — Faroe Islands", artifact: fieldnotes },
];

// Idempotent seed: a demo user (with a password) + workspace + a realistic, organized library
// (folders with linked artifacts + a few loose at the root), so the demo account simulates real usage.
const DEMO_EMAIL = "demo@galleo.app";
const DEMO_PASSWORD = "demo1234";

const log = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

type Doc = { title: string; artifact: ArtifactContent };
const demo = (id: string): Doc => {
    const d = DEMOS.find((x) => x.id === id);
    if (!d) throw new Error(`no demo "${id}"`);
    return { title: d.title, artifact: d.artifact };
};
const tpl = (id: string): Doc => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`no template "${id}"`);
    return { title: t.name, artifact: t.artifact };
};

// folder name → its artifacts; `null` folder = loose at the library root
const PLAN: { folder: string | null; docs: Doc[] }[] = [
    { folder: "Decks", docs: [demo("galleo"), demo("aria"), tpl("series-a"), tpl("sales-deck")] },
    {
        folder: "Web & landing",
        docs: [demo("terra"), demo("lumen"), tpl("landing-page"), tpl("portfolio")],
    },
    { folder: "Reports & writing", docs: [demo("helios"), demo("slowweb"), tpl("annual-report")] },
    { folder: "Personal", docs: [demo("fieldnotes"), tpl("photo-essay")] },
    { folder: null, docs: [tpl("market-analysis"), tpl("newsletter")] },
];

async function seed(): Promise<void> {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
    if (!user) {
        [user] = await db
            .insert(schema.users)
            .values({ email: DEMO_EMAIL, name: "Demo User" })
            .returning();
        log("• created demo user");
    }
    if (!user) throw new Error("failed to create demo user");
    await db
        .update(schema.users)
        .set({ passwordHash: hashPassword(DEMO_PASSWORD) })
        .where(eq(schema.users.id, user.id));

    let [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, "demo"));
    if (!ws) {
        [ws] = await db
            .insert(schema.workspaces)
            .values({ name: "Demo Workspace", slug: "demo", ownerId: user.id })
            .returning();
        log("• created demo workspace");
    }
    if (!ws) throw new Error("failed to create workspace");

    const ms = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
    if (!ms.some((m) => m.workspaceId === ws.id)) {
        await db
            .insert(schema.members)
            .values({ workspaceId: ws.id, userId: user.id, role: "owner" });
    }

    // Reset the workspace (artifacts reference folders, so clear artifacts first), then rebuild.
    await db.delete(schema.artifacts).where(eq(schema.artifacts.workspaceId, ws.id));
    await db.delete(schema.folders).where(eq(schema.folders.workspaceId, ws.id));

    let folders = 0;
    let docs = 0;
    for (const group of PLAN) {
        let folderId: string | null = null;
        if (group.folder) {
            const [f] = await db
                .insert(schema.folders)
                .values({ workspaceId: ws.id, name: group.folder })
                .returning({ id: schema.folders.id });
            folderId = f?.id ?? null;
            folders++;
        }
        for (const d of group.docs) {
            await db.insert(schema.artifacts).values({
                workspaceId: ws.id,
                title: d.title,
                formatId: d.artifact.format,
                themeId: d.artifact.theme,
                draftContent: d.artifact,
                folderId,
                createdBy: user.id,
            });
            docs++;
        }
    }

    log(`• seeded ${docs} artifacts across ${folders} folders`);
    log(`\nLog in with:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
}

seed()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${String(e)}\n`);
        process.exit(1);
    });
