import type { Surface } from "../../stores/generate";

// the idea bank behind the intake modal's example chips

export const PLACEHOLDER =
    "A launch deck for a calm operating system that helps solo studios handle projects, invoices, and cashflow in one place…";

const EXAMPLE_PROMPTS: { text: string; format: Surface }[] = [
    { text: "A launch deck for Meridian, a calm OS for solo studios", format: "deck" },
    { text: "A landing page for a whisper-quiet air purifier", format: "web" },
    { text: "An annual climate report — one year measured in degrees", format: "doc" },
    { text: "A pitch for a maps API that developers actually enjoy", format: "deck" },
    { text: "A seed pitch deck for a B2B fintech automating expense reports", format: "deck" },
    { text: "A Series A deck for a climate startup capturing carbon from cement", format: "deck" },
    { text: "A sales deck for an enterprise cybersecurity platform", format: "deck" },
    { text: "A product launch deck for an AI note-taking app", format: "deck" },
    { text: "A Q3 all-hands deck: results, wins, and the Q4 roadmap", format: "deck" },
    { text: "A go-to-market deck for a new developer analytics tool", format: "deck" },
    { text: "An investor update for a direct-to-consumer coffee brand", format: "deck" },
    { text: "A conference talk on designing for trust in AI products", format: "deck" },
    { text: "A brand strategy deck for a sustainable activewear label", format: "deck" },
    { text: "A board deck reviewing this quarter's growth and burn", format: "deck" },
    { text: "A one-pager for a $3M seed round in healthtech", format: "doc" },
    { text: "A product requirements doc for a mobile checkout redesign", format: "doc" },
    { text: "An annual impact report for a clean-water nonprofit", format: "doc" },
    { text: "A whitepaper on stablecoin settlement for cross-border payments", format: "doc" },
    { text: "A case study: how we cut churn 40% in two quarters", format: "doc" },
    { text: "A 2026 state-of-AI-in-healthcare research report", format: "doc" },
    { text: "A remote-first company handbook and culture guide", format: "doc" },
    { text: "A grant proposal for an urban reforestation program", format: "doc" },
    { text: "A market analysis of the EV-charging landscape", format: "doc" },
    { text: "A press release announcing our $12M Series A", format: "doc" },
    { text: "A landing page for a weeknight meal-kit subscription", format: "web" },
    { text: "A pricing page for a team video-hosting platform", format: "web" },
    { text: "A portfolio site for a freelance brand designer", format: "web" },
    { text: "A waitlist page for an AI pair-programming assistant", format: "web" },
    { text: "A homepage for a boutique architecture studio", format: "web" },
    { text: "A features page for a personal-finance budgeting app", format: "web" },
    { text: "A launch page for a hot-swappable mechanical keyboard", format: "web" },
    { text: "An about page for a third-generation family winery", format: "web" },
    { text: "A landing page for a neighborhood yoga and breathwork studio", format: "web" },
];

// the composer's three settings. Labels carry their own noun so a bare pill still reads as a
// setting ("Standard length", not "Standard") once it's out of a labelled row.
export const SURFACES = [
    { value: "deck", label: "Deck" },
    { value: "doc", label: "Document" },
    { value: "web", label: "Website" },
];
export const LENGTHS = [
    { value: "Short", label: "Short" },
    { value: "Standard", label: "Standard length" },
    { value: "In-depth", label: "In-depth" },
];
export const IMAGE_SOURCES = [
    { value: "stock", label: "Stock photos" },
    { value: "ai", label: "AI images" },
];

// Fisher–Yates shuffle of the idea bank
export function shuffledPrompts(): { text: string; format: Surface }[] {
    const a = [...EXAMPLE_PROMPTS];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]!;
        a[i] = a[j]!;
        a[j] = t;
    }
    return a;
}
