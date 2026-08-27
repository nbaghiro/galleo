import type { CreditPackId, FeatureOverrides, PlanId, ScheduledChange } from "@model/billing";
import type { Usage } from "@model/credits";
import type { ToolId } from "@model/tools";

// The demo universe as data: who exists, which workspaces they hold, and in what state. Separate
// from seed.ts so the specs can be read without importing an entry point that would run the seed on
// import. This sits in db/ and so may not reach into core/: documents are named here and resolved
// to content by seed.ts.

export const DEMO_EMAIL = "demo@galleo.app";
export const DEMO_PASSWORD = "galleo-demo-2026";

export interface Person {
    email: string;
    name: string;
    avatar: string; // a real headshot, so member lists and cursors look like a real workspace
}

const portrait = (g: "men" | "women", n: number): string =>
    `https://randomuser.me/api/portraits/${g}/${n}.jpg`;

// Every seeded account shares the demo password, so a role can be checked from the other side too.
// Emails are demo+<role>@ and the display names say the same thing, so a member list reads as the
// roles it is demonstrating rather than as a cast of invented people: whoever is looking at the
// screen can tell which account they are without cross-referencing a name against an email.
export const PEOPLE: Person[] = [
    { email: DEMO_EMAIL, name: "Demo User", avatar: portrait("women", 44) },
    { email: "demo+admin@galleo.app", name: "Demo Admin", avatar: portrait("women", 65) },
    { email: "demo+member@galleo.app", name: "Demo Member", avatar: portrait("men", 22) },
    { email: "demo+invited@galleo.app", name: "Demo Invitee", avatar: portrait("men", 75) },
];

// What the demo universe used to hold and no longer declares. The seed upserts by slug and by
// email, so anything dropped from the two lists above would otherwise sit in the database forever,
// still logged-in-able and still showing in the workspace switcher. Listed rather than matched by
// pattern on purpose: a real signup at a galleo.app address must never be reapable, and the local
// database already holds several.
export const RETIRED_SLUGS = ["ridgeline", "harbor", "weekend", "helios-climate"];
export const RETIRED_EMAILS = ["demo+owner@galleo.app", "demo+invited-admin@galleo.app"];

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

// What a synthesized view looks like it came from; seed.ts walks both in order, so the analytics
// chart is the same shape on every reseed.
export const REFERRERS = ["direct", "mail.google.com", "www.linkedin.com", "t.co", "www.notion.so"];
export const COUNTRIES = ["US", "GB", "DE", "SE", "NL"];

export interface ThemeSpec {
    from: string; // a built-in theme id to derive from
    name: string;
    accent: string;
    mood: string;
}

// `at` is days ago; fractions are fine (0.25 = six hours)
export type Charge =
    | { at: number; kind: "spend"; tool: ToolId; credits: number; usage: Usage; by: string }
    | { at: number; kind: "grant" } // the monthly roll: adds the grant, keeps the leftovers
    | { at: number; kind: "topup"; pack: CreditPackId };

export interface WorkspaceSpec {
    slug: string;
    name: string;
    plan: PlanId;
    ownerEmail: string;
    seats: number; // total, including the plan's own included seats
    /**
     * What the workspace had banked before the ledger below starts. Defaults to one month's grant.
     * Set it lower to open mid-cycle: with rollover a workspace that opened on a full grant and then
     * barely spent would bank several months, which reads as a bug rather than as a demo.
     */
    openingBalance?: number;
    members: MemberSpec[]; // never includes the owner
    invites?: InviteSpec[];
    planStatus?: "active" | "past_due" | "canceled";
    periodEndInDays?: number; // negative = already elapsed (dunning)
    cancelAtPeriodEnd?: boolean; // a plain cancel; mutually exclusive with scheduledChange
    scheduledChange?: Omit<ScheduledChange, "at">; // `at` is filled from periodEndInDays
    featureOverrides?: FeatureOverrides;
    /** Narration written and recorded ahead of anyone playing it. Defaults to on for the demo. */
    prepareAudio?: boolean;
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

// the demo login (DEMO_EMAIL) is a member of every one of these: every surface resolves through `members`, so a
// workspace they can't switch into is dead data.
export const WORKSPACES: WorkspaceSpec[] = [
    {
        slug: "demo",
        name: "Premium Workspace",
        plan: "premium",
        ownerEmail: DEMO_EMAIL, // the one they own: member management is the owner-only surface that works without Stripe
        seats: 5, // the 3 the plan includes plus 2 bought as the seat add-on
        openingBalance: 1450, // part-way through a 2400 cycle
        members: [
            { email: "demo+admin@galleo.app", role: "admin" },
            { email: "demo+member@galleo.app", role: "member" },
        ],
        invites: [{ email: "demo+invited@galleo.app", role: "member", sentDaysAgo: 2 }],
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
            { templateId: "landing-page", by: "demo+admin@galleo.app", uses: 2 },
            { templateId: "annual-report", by: "demo+member@galleo.app", uses: 1 },
        ],
        ledger: [
            { at: 9, kind: "topup", pack: "pack-2k" },
            {
                at: 26,
                kind: "spend",
                tool: "generate-artifact",
                credits: 41,
                usage: { plan: 1, section: 12, image: 2 },
                by: "demo+admin@galleo.app",
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
                by: "demo+member@galleo.app",
            },
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
                by: "demo+admin@galleo.app",
            },
            {
                at: 9,
                kind: "spend",
                tool: "ask-assistant",
                credits: 12,
                usage: { reply: 1 },
                by: "demo+member@galleo.app",
            },
            {
                at: 8,
                kind: "spend",
                tool: "generate-artifact",
                credits: 39,
                usage: { plan: 1, section: 11, image: 2 },
                by: "demo+member@galleo.app",
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
                by: "demo+admin@galleo.app",
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
                by: "demo+member@galleo.app",
            },
            {
                at: 1,
                kind: "spend",
                tool: "generate-artifact",
                credits: 43,
                usage: { plan: 1, section: 12, image: 3 },
                by: "demo+member@galleo.app",
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
        slug: "pro",
        name: "Pro Workspace",
        plan: "pro",
        ownerEmail: DEMO_EMAIL,
        // Pro sells one seat, so a solo library is the whole shape of it: no members, no invites,
        // and the artifact cap lifted, which is the difference a Pro subscriber is paying for.
        seats: 1,
        members: [],
        planStatus: "active",
        periodEndInDays: 27,
        openingBalance: 415, // part-way through a 700 cycle, before the spend below
        windowStartedDaysAgo: 9,
        folders: [
            {
                folder: "Client work",
                docs: [
                    { ref: { template: "project-proposal" } },
                    { ref: { template: "case-study" } },
                    { ref: { template: "sow" } },
                ],
            },
            {
                folder: null,
                docs: [
                    { ref: { corpus: "fieldnotes" } },
                    { ref: { template: "capabilities-deck" } },
                    { ref: { template: "exec-summary" } },
                ],
            },
        ],
        trashed: [{ ref: { template: "client-status" }, daysAgo: 4 }],
        visits: [{ corpus: "fieldnotes" }],
        // Lands near 415 of 700: room left, which is what a working Pro month looks like. Pro runs
        // the better models, so a generation costs more per section than it does on Free.
        ledger: [
            {
                at: 7,
                kind: "spend",
                tool: "generate-artifact",
                credits: 68,
                usage: { plan: 1, section: 14, image: 4 },
                by: DEMO_EMAIL,
            },
            {
                at: 5,
                kind: "spend",
                tool: "generate-artifact",
                credits: 54,
                usage: { plan: 1, section: 12, image: 2 },
                by: DEMO_EMAIL,
            },
            {
                at: 3,
                kind: "spend",
                tool: "rewrite-section",
                credits: 4,
                usage: { section: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 2,
                kind: "spend",
                tool: "generate-theme",
                credits: 4,
                usage: { theme: 1 },
                by: DEMO_EMAIL,
            },
            {
                at: 1,
                kind: "spend",
                tool: "generate-image",
                credits: 25,
                usage: { image: 5 },
                by: DEMO_EMAIL,
            },
        ],
    },
    {
        slug: "free",
        name: "Free Workspace",
        plan: "free",
        ownerEmail: DEMO_EMAIL,
        // Free is one seat and the demo login holds it, so an invite has nowhere to go: the seat
        // wall is reachable from the owner's own settings rather than needing a second account.
        seats: 1,
        members: [],
        planStatus: "active",
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
                by: DEMO_EMAIL,
            },
            { at: 6, kind: "grant" },
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
                by: DEMO_EMAIL,
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
                by: DEMO_EMAIL,
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
];
