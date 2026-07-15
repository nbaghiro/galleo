import "dotenv/config";
import type { ArtifactContent } from "@model/artifact";
import { eq } from "drizzle-orm";
import { db, schema } from "./schema";
import { hashPassword } from "./auth";
import { createWorkspaceForUser } from "./provision";
import { TEMPLATES } from "./templates";
import { aria } from "./demos/aria";
import { fieldnotes } from "./demos/fieldnotes";
import { galleo } from "./demos/galleo";
import { helios } from "./demos/helios";
import { lumen } from "./demos/lumen";
import { slowweb } from "./demos/slowweb";
import { terra } from "./demos/terra";

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

const DEMO_EMAIL = "demo@galleo.app";
const DEMO_PASSWORD = "galleo-demo-2026";

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
            .values({ email: DEMO_EMAIL, name: "Demo User", emailVerifiedAt: new Date() })
            .returning();
        log("• created demo user");
    }
    if (!user) throw new Error("failed to create demo user");
    await db
        .update(schema.users)
        .set({ passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() })
        .where(eq(schema.users.id, user.id));

    const [existingWs] = await db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, "demo"));
    let wsId = existingWs?.id ?? null;
    if (!wsId) {
        // premium: seed writes 12+ artifacts directly, bypassing the API cap; demo account needs unlimited
        const created = await createWorkspaceForUser(user.id, {
            name: "Demo Workspace",
            slug: "demo",
            plan: "premium",
        });
        wsId = created.id;
        log("• created demo workspace");
    }

    // artifacts reference folders, so clear artifacts first
    await db.delete(schema.artifacts).where(eq(schema.artifacts.workspaceId, wsId));
    await db.delete(schema.folders).where(eq(schema.folders.workspaceId, wsId));

    let folders = 0;
    let docs = 0;
    for (const group of PLAN) {
        let folderId: string | null = null;
        if (group.folder) {
            const [f] = await db
                .insert(schema.folders)
                .values({ workspaceId: wsId, name: group.folder })
                .returning({ id: schema.folders.id });
            folderId = f?.id ?? null;
            folders++;
        }
        for (const d of group.docs) {
            await db.insert(schema.artifacts).values({
                workspaceId: wsId,
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

    // Recent-media library — "recently used" images for the media picker's Recent tab. Reset first so
    // re-seeding stays idempotent. picsum gives stable, varied photos without any API key.
    await db.delete(schema.assets).where(eq(schema.assets.workspaceId, wsId));
    const cc = (author: string) => ({
        provider: "Openverse",
        author,
        authorUrl: "https://openverse.org",
        sourceUrl: "https://openverse.org",
    });
    const DEMO_ASSETS: {
        source: string;
        seed: string;
        w: number;
        h: number;
        alt: string;
        prompt?: string;
        attribution?: ReturnType<typeof cc>;
    }[] = [
        {
            source: "stock",
            seed: "galleo-meadow",
            w: 1600,
            h: 1000,
            alt: "Meadow at first light",
            attribution: cc("Priya Nair"),
        },
        {
            source: "generated",
            seed: "galleo-solar",
            w: 1536,
            h: 864,
            alt: "Rooftop solar array at golden hour",
            prompt: "a 1.4-megawatt rooftop solar array at golden hour, wide angle, photographic",
        },
        {
            source: "stock",
            seed: "galleo-coast",
            w: 1600,
            h: 1067,
            alt: "Rocky coastline at dusk",
            attribution: cc("Marco Ferri"),
        },
        { source: "upload", seed: "galleo-offsite", w: 1400, h: 933, alt: "team-offsite.jpg" },
        {
            source: "generated",
            seed: "galleo-studio",
            w: 1024,
            h: 1024,
            alt: "Late-night recording studio",
            prompt: "a moody late-night recording studio bathed in neon, cinematic, shallow depth of field",
        },
        {
            source: "stock",
            seed: "galleo-city",
            w: 1600,
            h: 1000,
            alt: "City skyline at dusk",
            attribution: cc("Lena Osei"),
        },
        { source: "upload", seed: "galleo-flatlay", w: 1200, h: 1200, alt: "product-flatlay.png" },
        {
            source: "stock",
            seed: "galleo-lake",
            w: 1600,
            h: 1000,
            alt: "Mountain lake, still water",
            attribution: cc("Kamil Porembiński"),
        },
    ];
    const now = Date.now();
    for (let i = 0; i < DEMO_ASSETS.length; i++) {
        const a = DEMO_ASSETS[i]!;
        await db.insert(schema.assets).values({
            workspaceId: wsId,
            kind: "image",
            source: a.source,
            url: `https://picsum.photos/seed/${a.seed}/${a.w}/${a.h}`,
            width: a.w,
            height: a.h,
            alt: a.alt,
            meta: {
                attribution: a.attribution,
                prompt: a.prompt,
                thumbUrl: `https://picsum.photos/seed/${a.seed}/500/${Math.round((500 * a.h) / a.w)}`,
            },
            createdAt: new Date(now - i * 3_600_000), // newest first in the Recent grid
        });
        docs++;
    }
    log(`• seeded ${DEMO_ASSETS.length} recent-media assets`);
    log(`\nLog in with:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
}

seed()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${String(e)}\n`);
        process.exit(1);
    });
