import { inArray } from "drizzle-orm";
import type { FeatureOverrides, PlanId, ScheduledChange } from "@model/billing";
import type { Usage } from "@model/credits";
import type { ToolId } from "@model/tools";
import { db } from "./client";
import { schema } from "./schema";

// The demo universe as data: who exists, which workspaces they hold, and in what state. Separate
// from seed.ts so the specs can be read without importing an entry point that would run the seed on
// import. This sits in db/ and so may not reach into core/: documents are named here and resolved
// to content by seed.ts.

export const DEMO_EMAIL = "demo@galleo.app";
export const DEMO_PASSWORD = "galleo-demo-2026";

export interface Person {
    email: string;
    name: string;
}

// every seeded account shares the demo password, so a role can be checked from the other side too
export const PEOPLE: Person[] = [
    { email: DEMO_EMAIL, name: "Demo User" },
    { email: "priya.raman@galleo.app", name: "Priya Raman" },
    { email: "marcus.oyelaran@galleo.app", name: "Marcus Oyelaran" },
    { email: "hanna.lindqvist@galleo.app", name: "Hanna Lindqvist" },
    { email: "tomas.vidal@galleo.app", name: "Tomás Vidal" },
    { email: "june.park@galleo.app", name: "June Park" },
];

// a corpus artifact or a template body; seed.ts turns it into content, since both live in core/
export type DocRef = { corpus: string } | { template: string };

export const refKey = (ref: DocRef): string =>
    "corpus" in ref ? `corpus:${ref.corpus}` : `template:${ref.template}`;

export interface DocEntry {
    ref: DocRef;
    // provenance for a generated artifact; seed.ts fills the model ids from the registry
    ai?: { prompt: string; surface: string; daysAgo: number };
}

export interface FolderSpec {
    folder: string | null; // null = loose at the library root
    docs: DocEntry[];
}

export interface MemberSpec {
    email: string;
    role: "admin" | "member";
}

export interface InviteSpec {
    email: string;
    role: "admin" | "member";
    sentDaysAgo: number;
}

export interface TrashSpec {
    ref: DocRef;
    daysAgo: number;
}

export interface RecipientSpec {
    email: string;
    views: number;
}

export interface LinkSpec {
    ref: DocRef; // an artifact seeded into this workspace
    slug: string; // pinned, so /p/<slug> survives a reseed
    name: string;
    visibility: "public" | "protected" | "private";
    password?: string;
    recipients?: RecipientSpec[];
    views?: number; // anonymous sessions to synthesize
    createdDaysAgo: number;
}

export interface ThemeSpec {
    from: string; // a built-in theme id to derive from
    name: string;
    accent: string;
    mood: string;
}

// `at` is days ago; fractions are fine (0.25 = six hours)
export type Charge =
    | { at: number; kind: "spend"; tool: ToolId; credits: number; usage: Usage; by: string }
    | { at: number; kind: "reset" };

export interface WorkspaceSpec {
    slug: string;
    name: string;
    plan: PlanId;
    ownerEmail: string;
    seats: number; // total, including the plan's own included seats
    creditBlocks?: number; // the credit add-on's quantity
    members: MemberSpec[]; // never includes the owner
    invites?: InviteSpec[];
    planStatus?: "active" | "past_due" | "canceled";
    periodEndInDays?: number; // negative = already elapsed (dunning)
    cancelAtPeriodEnd?: boolean; // a plain cancel; mutually exclusive with scheduledChange
    scheduledChange?: Omit<ScheduledChange, "at">; // `at` is filled from periodEndInDays
    featureOverrides?: FeatureOverrides;
    windowStartedDaysAgo: number; // < 30, else the first read rolls the window away
    ledger?: Charge[];
    folders?: FolderSpec[];
    trashed?: TrashSpec[];
    links?: LinkSpec[];
    themes?: ThemeSpec[];
    contexts?: boolean; // ingest DEMO_CONTEXTS (needs an embedding key)
    assets?: boolean;
    visits?: DocRef[]; // what the demo user has opened
    templateUses?: { templateId: string; by: string; uses: number }[];
}

// demo@galleo.app is a member of every one of these: every surface resolves through `members`, so a
// workspace they can't switch into is dead data.
export const WORKSPACES: WorkspaceSpec[] = [
    {
        slug: "demo",
        name: "Northwind Studio",
        plan: "premium",
        ownerEmail: DEMO_EMAIL, // the one they own: member management is the owner-only surface that works without Stripe
        seats: 8, // 3 the plan includes + 5 bought as the seat add-on
        creditBlocks: 2,
        members: [
            { email: "priya.raman@galleo.app", role: "admin" },
            { email: "marcus.oyelaran@galleo.app", role: "member" },
            { email: "hanna.lindqvist@galleo.app", role: "member" },
        ],
        invites: [
            { email: "tomas.vidal@galleo.app", role: "member", sentDaysAgo: 2 },
            { email: "june.park@galleo.app", role: "admin", sentDaysAgo: 9 },
        ],
        planStatus: "active",
        periodEndInDays: 21,
        windowStartedDaysAgo: 12,
        folders: [
            {
                folder: "Decks",
                docs: [
                    { ref: { corpus: "galleo" } },
                    { ref: { corpus: "aria" } },
                    { ref: { template: "series-a" } },
                    { ref: { template: "sales-deck" } },
                ],
            },
            {
                folder: "Web & landing",
                docs: [
                    { ref: { corpus: "terra" } },
                    {
                        ref: { corpus: "lumen" },
                        ai: {
                            prompt: "a launch page for the Lumen One air purifier",
                            surface: "web",
                            daysAgo: 11,
                        },
                    },
                    { ref: { template: "landing-page" } },
                    { ref: { template: "portfolio" } },
                ],
            },
            {
                folder: "Reports & writing",
                docs: [
                    { ref: { corpus: "helios" } },
                    { ref: { corpus: "slowweb" } },
                    { ref: { template: "annual-report" } },
                ],
            },
            {
                folder: "Personal",
                docs: [{ ref: { corpus: "fieldnotes" } }, { ref: { template: "photo-essay" } }],
            },
            {
                folder: null,
                docs: [
                    { ref: { template: "market-analysis" } },
                    { ref: { template: "newsletter" } },
                ],
            },
        ],
        trashed: [
            { ref: { template: "qbr" }, daysAgo: 3 },
            { ref: { template: "event-invite" }, daysAgo: 11 },
            { ref: { template: "cover-letter" }, daysAgo: 26 },
        ],
        links: [
            {
                ref: { corpus: "helios" },
                slug: "helios-q3",
                name: "Board pack",
                visibility: "private",
                recipients: [
                    { email: "chair@northwind.example", views: 4 },
                    { email: "cfo@northwind.example", views: 2 },
                    { email: "observer@northwind.example", views: 0 },
                ],
                createdDaysAgo: 9,
            },
            {
                ref: { corpus: "lumen" },
                slug: "lumen-launch",
                name: "Press + partners",
                visibility: "public",
                views: 34,
                createdDaysAgo: 16,
            },
            {
                ref: { corpus: "terra" },
                slug: "terra-preview",
                name: "Client preview",
                visibility: "protected",
                password: "terra",
                views: 7,
                createdDaysAgo: 5,
            },
        ],
        themes: [
            { from: "studio", name: "Northwind brand", accent: "#1f6f5c", mood: "calm, editorial" },
        ],
        contexts: true,
        assets: true,
        visits: [{ corpus: "helios" }, { corpus: "lumen" }, { corpus: "aria" }],
        templateUses: [
            { templateId: "series-a", by: DEMO_EMAIL, uses: 3 },
            { templateId: "landing-page", by: "priya.raman@galleo.app", uses: 2 },
            { templateId: "annual-report", by: "hanna.lindqvist@galleo.app", uses: 1 },
        ],
        ledger: [
            {
                at: 26,
                kind: "spend",
                tool: "generate-artifact",
                credits: 41,
                usage: { plan: 1, section: 12, image: 2 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 22,
                kind: "spend",
                tool: "generate-artifact",
                credits: 44,
                usage: { plan: 1, section: 12, image: 3 },
                by: DEMO_EMAIL,
            },
            {
                at: 18,
                kind: "spend",
                tool: "ask-assistant",
                credits: 12,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            { at: 12, kind: "reset" },
            {
                at: 11,
                kind: "spend",
                tool: "generate-artifact",
                credits: 46,
                usage: { plan: 1, section: 14, image: 3 },
                by: DEMO_EMAIL,
            },
            {
                at: 10,
                kind: "spend",
                tool: "generate-image",
                credits: 15,
                usage: { image: 3 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 9,
                kind: "spend",
                tool: "ask-assistant",
                credits: 12,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 8,
                kind: "spend",
                tool: "generate-artifact",
                credits: 39,
                usage: { plan: 1, section: 11, image: 2 },
                by: "hanna.lindqvist@galleo.app",
            },
            {
                at: 7,
                kind: "spend",
                tool: "revise-element",
                credits: 3,
                usage: { text: 2 },
                by: DEMO_EMAIL,
            },
            {
                at: 5,
                kind: "spend",
                tool: "generate-video",
                credits: 100,
                usage: { video: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 4,
                kind: "spend",
                tool: "ask-assistant",
                credits: 14,
                usage: { reply: 1 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 3,
                kind: "spend",
                tool: "rewrite-section",
                credits: 2,
                usage: { section: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 2,
                kind: "spend",
                tool: "generate-theme",
                credits: 5,
                usage: { theme: 1 },
                by: "hanna.lindqvist@galleo.app",
            },
            {
                at: 1,
                kind: "spend",
                tool: "generate-artifact",
                credits: 43,
                usage: { plan: 1, section: 12, image: 3 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 0.5,
                kind: "spend",
                tool: "ask-assistant",
                credits: 11,
                usage: { reply: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 0.2,
                kind: "spend",
                tool: "rewrite-text",
                credits: 1,
                usage: { text: 1 },
                by: DEMO_EMAIL,
            },
        ],
    },
    {
        slug: "ridgeline",
        name: "Ridgeline Partners",
        plan: "premium",
        ownerEmail: "priya.raman@galleo.app",
        seats: 3, // exactly the plan's included seats, all taken, so an invite takes the no-seats 402
        members: [
            { email: DEMO_EMAIL, role: "admin" },
            { email: "marcus.oyelaran@galleo.app", role: "member" },
        ],
        planStatus: "active",
        periodEndInDays: 9,
        scheduledChange: { plan: "pro", interval: "month", seats: 1, creditBlocks: 0 },
        // a narrower artifact cap than Premium grants, so the override path is exercised in the
        // restricting direction too
        featureOverrides: { maxArtifacts: 40 },
        windowStartedDaysAgo: 20,
        folders: [
            {
                folder: "Client work",
                docs: [
                    { ref: { template: "qbr" } },
                    { ref: { template: "case-study" } },
                    { ref: { template: "business-proposal" } },
                ],
            },
            {
                folder: null,
                docs: [
                    { ref: { template: "gtm-plan" } },
                    { ref: { template: "project-proposal" } },
                ],
            },
        ],
        trashed: [{ ref: { template: "sow" }, daysAgo: 4 }],
        links: [
            {
                ref: { template: "qbr" },
                slug: "ridgeline-qbr",
                name: "Q3 review",
                visibility: "public",
                views: 21,
                createdDaysAgo: 12,
            },
        ],
        themes: [
            {
                from: "studio",
                name: "Ridgeline slate",
                accent: "#3b5bdb",
                mood: "sharp, corporate",
            },
        ],
        visits: [{ template: "qbr" }, { template: "case-study" }],
        ledger: [
            {
                at: 24,
                kind: "spend",
                tool: "generate-artifact",
                credits: 45,
                usage: { plan: 1, section: 13, image: 3 },
                by: "priya.raman@galleo.app",
            },
            { at: 20, kind: "reset" },
            {
                at: 18,
                kind: "spend",
                tool: "generate-artifact",
                credits: 44,
                usage: { plan: 1, section: 12, image: 3 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 17,
                kind: "spend",
                tool: "generate-artifact",
                credits: 71,
                usage: { plan: 1, section: 19, image: 6 },
                by: DEMO_EMAIL,
            },
            {
                at: 15,
                kind: "spend",
                tool: "ask-assistant",
                credits: 13,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 14,
                kind: "spend",
                tool: "generate-artifact",
                credits: 63,
                usage: { plan: 1, section: 18, image: 4 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 12,
                kind: "spend",
                tool: "ask-assistant",
                credits: 26,
                usage: { reply: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 11,
                kind: "spend",
                tool: "generate-artifact",
                credits: 58,
                usage: { plan: 1, section: 16, image: 4 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 10,
                kind: "spend",
                tool: "generate-image",
                credits: 20,
                usage: { image: 4 },
                by: DEMO_EMAIL,
            },
            {
                at: 9,
                kind: "spend",
                tool: "generate-artifact",
                credits: 76,
                usage: { plan: 1, section: 20, image: 6 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 8,
                kind: "spend",
                tool: "ask-assistant",
                credits: 24,
                usage: { reply: 1 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 7,
                kind: "spend",
                tool: "generate-artifact",
                credits: 69,
                usage: { plan: 1, section: 19, image: 5 },
                by: DEMO_EMAIL,
            },
            {
                at: 6,
                kind: "spend",
                tool: "ask-assistant",
                credits: 14,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 5,
                kind: "spend",
                tool: "generate-artifact",
                credits: 81,
                usage: { plan: 1, section: 22, image: 6 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 4,
                kind: "spend",
                tool: "generate-theme",
                credits: 4,
                usage: { theme: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 3,
                kind: "spend",
                tool: "generate-artifact",
                credits: 74,
                usage: { plan: 1, section: 20, image: 5 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 2,
                kind: "spend",
                tool: "ask-assistant",
                credits: 31,
                usage: { reply: 1 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 1,
                kind: "spend",
                tool: "generate-artifact",
                credits: 66,
                usage: { plan: 1, section: 18, image: 5 },
                by: DEMO_EMAIL,
            },
            {
                at: 0.4,
                kind: "spend",
                tool: "rewrite-section",
                credits: 3,
                usage: { section: 1 },
                by: DEMO_EMAIL,
            },
        ],
    },
    {
        slug: "harbor",
        name: "Harbor & Vine",
        plan: "free",
        ownerEmail: "marcus.oyelaran@galleo.app",
        // a lapsed subscription: customer.subscription.deleted writes free + canceled + seats 1 and
        // keeps the members, so two members over one seat is the real shape of a churned workspace
        seats: 1,
        members: [{ email: DEMO_EMAIL, role: "admin" }],
        planStatus: "canceled",
        // the Free cap is 500 MB and only stored bytes count, so narrow it to make the wall reachable
        featureOverrides: { storageMb: 1 },
        windowStartedDaysAgo: 6,
        // exactly 10 live artifacts: at the Free cap, so POST /artifacts 402s
        folders: [
            {
                folder: "Job hunt",
                docs: [
                    { ref: { template: "resume" } },
                    { ref: { template: "cover-letter" } },
                    { ref: { template: "personal-site" } },
                ],
            },
            {
                folder: null,
                docs: [
                    { ref: { corpus: "fieldnotes" } },
                    { ref: { corpus: "slowweb" } },
                    { ref: { template: "newsletter" } },
                    { ref: { template: "event-invite" } },
                    { ref: { template: "photo-essay" } },
                    { ref: { template: "waitlist-page" } },
                    { ref: { template: "portfolio" } },
                ],
            },
        ],
        trashed: [
            { ref: { template: "sow" }, daysAgo: 5 },
            { ref: { template: "trends-report" }, daysAgo: 20 },
        ],
        visits: [{ corpus: "fieldnotes" }, { corpus: "slowweb" }],
        // Lands at 95 of 100: rewrite-text (1) still passes, ask-assistant and generate-artifact
        // both take the 402 branch. Free runs basic models, so each charge is exactly costOf(usage),
        // and no generation exceeds the plan's 10-section cap.
        ledger: [
            {
                at: 21,
                kind: "spend",
                tool: "generate-artifact",
                credits: 31,
                usage: { plan: 1, section: 9, image: 2 },
                by: DEMO_EMAIL,
            },
            {
                at: 17,
                kind: "spend",
                tool: "ask-assistant",
                credits: 2,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            { at: 6, kind: "reset" },
            {
                at: 5,
                kind: "spend",
                tool: "generate-artifact",
                credits: 29,
                usage: { plan: 1, section: 8, image: 2 },
                by: DEMO_EMAIL,
            },
            {
                at: 4,
                kind: "spend",
                tool: "generate-artifact",
                credits: 20,
                usage: { plan: 1, section: 6, image: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 3,
                kind: "spend",
                tool: "generate-artifact",
                credits: 17,
                usage: { plan: 1, section: 7 },
                by: DEMO_EMAIL,
            },
            {
                at: 2,
                kind: "spend",
                tool: "ask-assistant",
                credits: 2,
                usage: { reply: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 1.5,
                kind: "spend",
                tool: "generate-image",
                credits: 20,
                usage: { image: 4 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 1,
                kind: "spend",
                tool: "rewrite-section",
                credits: 2,
                usage: { section: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 0.5,
                kind: "spend",
                tool: "generate-theme",
                credits: 4,
                usage: { theme: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 0.2,
                kind: "spend",
                tool: "rewrite-text",
                credits: 1,
                usage: { text: 1 },
                by: DEMO_EMAIL,
            },
        ],
    },
    {
        slug: "weekend",
        name: "Weekend Ideas",
        plan: "pro",
        ownerEmail: DEMO_EMAIL,
        // the Pro fixture, and the empty state: Pro is single-seat, so demo has to own it. Being a
        // plain member of someone else's workspace is covered by helios-climate.
        seats: 1,
        members: [],
        planStatus: "active",
        periodEndInDays: 27,
        windowStartedDaysAgo: 1,
    },
    {
        slug: "helios-climate",
        name: "Helios Climate",
        plan: "premium",
        ownerEmail: "hanna.lindqvist@galleo.app",
        seats: 6,
        members: [
            { email: "marcus.oyelaran@galleo.app", role: "admin" },
            { email: DEMO_EMAIL, role: "member" },
            { email: "priya.raman@galleo.app", role: "member" },
            { email: "tomas.vidal@galleo.app", role: "member" },
            { email: "june.park@galleo.app", role: "member" },
        ],
        planStatus: "past_due", // a failed renewal: the dunning banner in Pricing + Settings
        periodEndInDays: -3,
        windowStartedDaysAgo: 26,
        folders: [
            {
                folder: "Board",
                docs: [
                    { ref: { corpus: "helios" } },
                    { ref: { template: "board-deck" } },
                    { ref: { template: "annual-report" } },
                ],
            },
            {
                folder: null,
                docs: [
                    { ref: { template: "research-report" } },
                    { ref: { template: "trends-report" } },
                    { ref: { template: "qbr" } },
                ],
            },
        ],
        trashed: [{ ref: { template: "investor-update" }, daysAgo: 8 }],
        links: [
            {
                ref: { corpus: "helios" },
                slug: "helios-investors",
                name: "Investor update",
                visibility: "private",
                recipients: [
                    { email: "partner@ridgeline.example", views: 6 },
                    { email: "analyst@ridgeline.example", views: 3 },
                ],
                createdDaysAgo: 14,
            },
        ],
        visits: [{ corpus: "helios" }],
        ledger: [
            {
                at: 29,
                kind: "spend",
                tool: "generate-artifact",
                credits: 52,
                usage: { plan: 1, section: 15, image: 3 },
                by: "hanna.lindqvist@galleo.app",
            },
            { at: 26, kind: "reset" },
            {
                at: 24,
                kind: "spend",
                tool: "generate-artifact",
                credits: 58,
                usage: { plan: 1, section: 16, image: 4 },
                by: "hanna.lindqvist@galleo.app",
            },
            {
                at: 21,
                kind: "spend",
                tool: "ask-assistant",
                credits: 22,
                usage: { reply: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
            {
                at: 18,
                kind: "spend",
                tool: "generate-image",
                credits: 25,
                usage: { image: 5 },
                by: "june.park@galleo.app",
            },
            {
                at: 15,
                kind: "spend",
                tool: "ask-assistant",
                credits: 12,
                usage: { reply: 1 },
                by: "tomas.vidal@galleo.app",
            },
            {
                at: 12,
                kind: "spend",
                tool: "generate-artifact",
                credits: 47,
                usage: { plan: 1, section: 13, image: 3 },
                by: "priya.raman@galleo.app",
            },
            {
                at: 8,
                kind: "spend",
                tool: "rewrite-section",
                credits: 3,
                usage: { section: 1 },
                by: "hanna.lindqvist@galleo.app",
            },
            {
                at: 4,
                kind: "spend",
                tool: "ask-assistant",
                credits: 10,
                usage: { reply: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 1,
                kind: "spend",
                tool: "rewrite-section",
                credits: 2,
                usage: { section: 1 },
                by: "marcus.oyelaran@galleo.app",
            },
        ],
    },
];

const NOT_SEEDED = "run `pnpm seed` first";

/** email → user id, over the seeded cast. */
export async function seededUserIds(): Promise<Map<string, string>> {
    const emails = PEOPLE.map((p) => p.email);
    const rows = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.email, emails));
    const found = new Map(rows.map((r) => [r.email, r.id]));
    const missing = emails.filter((e) => !found.has(e));
    if (missing.length) throw new Error(`users not seeded: ${missing.join(", ")} — ${NOT_SEEDED}`);
    return found;
}
