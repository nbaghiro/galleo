import type { ArtifactContent } from "@model/artifact";

// The starter-template contract and its curated index, the same shape theme.ts uses: the catalog
// lives with the types that describe it. Ids, labels, and grouping only — the bodies are
// hand-authored artifacts served from services/core/templates.ts, so this stays edge-safe.

export interface Template {
    id: string;
    name: string;
    category: string;
    description: string;
    content: ArtifactContent;
}

export type TemplateEntry = Omit<Template, "content">;

// The starter catalog: ids, labels, and grouping only. The bodies are hand-authored artifacts that
// live server-side (services/artifacts/templates) and are resolved by id, so this stays edge-safe.
// An id here without a body there is a 404 at /templates, so the two must stay in sync.
export const TEMPLATE_INDEX: readonly TemplateEntry[] = [
    {
        id: "startup-pitch",
        name: "Startup Pitch Deck",
        category: "Pitch & sales",
        description: "Raise your round: problem, solution, market, traction, and the ask.",
    },
    {
        id: "sales-deck",
        name: "Sales Deck",
        category: "Pitch & sales",
        description: "Win the deal. The buyer's problem, your solution, proof, and pricing.",
    },
    {
        id: "series-a",
        name: "Series A Deck",
        category: "Pitch & sales",
        description: "The market shift, traction, unit economics, and the raise.",
    },
    {
        id: "product-demo",
        name: "Product Demo Deck",
        category: "Pitch & sales",
        description: "Walk through the product: the pain, the features, results, and pricing.",
    },
    {
        id: "company-overview",
        name: "Company Overview",
        category: "Pitch & sales",
        description: "Who you are. What you do, your products, the numbers, and the team.",
    },
    {
        id: "gtm-plan",
        name: "Go-to-Market Plan",
        category: "Pitch & sales",
        description: "Segments, positioning, channels, pricing, and KPIs for a launch.",
    },
    {
        id: "annual-report",
        name: "Annual Report",
        category: "Reports & research",
        description: "The year in review: letter, the numbers, financials, and what's next.",
    },
    {
        id: "case-study",
        name: "Case Study",
        category: "Reports & research",
        description: "Challenge to results, with the numbers and a customer quote.",
    },
    {
        id: "research-report",
        name: "Research Report",
        category: "Reports & research",
        description: "A whitepaper. Findings, the data, implications, and recommendations.",
    },
    {
        id: "market-analysis",
        name: "Market Analysis",
        category: "Reports & research",
        description: "Growth, segments, competition, and the outlook for a market.",
    },
    {
        id: "qbr",
        name: "Quarterly Business Review",
        category: "Reports & research",
        description: "A QBR: KPIs vs targets, pipeline, wins, misses, and priorities.",
    },
    {
        id: "trends-report",
        name: "Industry Trends Report",
        category: "Reports & research",
        description: "The trends shaping a sector, with the data, analysis, and predictions.",
    },
    {
        id: "product-launch",
        name: "Product Launch",
        category: "Marketing & web",
        description: "A launch site: hero, features, how it works, proof, and pricing.",
    },
    {
        id: "landing-page",
        name: "Landing Page",
        category: "Marketing & web",
        description: "A SaaS landing page. Benefits, a demo, testimonials, and tiers.",
    },
    {
        id: "event-page",
        name: "Event Page",
        category: "Marketing & web",
        description: "Speakers, the agenda, tickets, and a register CTA.",
    },
    {
        id: "waitlist-page",
        name: "Waitlist Page",
        category: "Marketing & web",
        description: "A coming-soon page: the vision, a sneak peek, and a waitlist CTA.",
    },
    {
        id: "agency-site",
        name: "Agency Site",
        category: "Marketing & web",
        description: "A studio website. Services, selected work, your approach, and contact.",
    },
    {
        id: "newsletter",
        name: "Newsletter",
        category: "Marketing & web",
        description: "An editor's note, the lead story, items, and links.",
    },
    {
        id: "project-proposal",
        name: "Project Proposal",
        category: "Proposals & updates",
        description: "Pitch the work: approach, scope, timeline, team, and investment.",
    },
    {
        id: "investor-update",
        name: "Investor Update",
        category: "Proposals & updates",
        description: "Your monthly update. Metrics, growth, wins, challenges, and asks.",
    },
    {
        id: "business-proposal",
        name: "Business Proposal",
        category: "Proposals & updates",
        description: "The solution, scope, timeline, pricing, and terms, formally set out.",
    },
    {
        id: "board-deck",
        name: "Board Deck",
        category: "Proposals & updates",
        description: "A quarterly board update: KPIs, financials, risks, and priorities.",
    },
    {
        id: "sponsorship-deck",
        name: "Sponsorship Proposal",
        category: "Proposals & updates",
        description: "Win sponsors. Your audience, reach, tiers, benefits, and the ask.",
    },
    {
        id: "sow",
        name: "Statement of Work",
        category: "Proposals & updates",
        description: "Scope, deliverables, timeline, responsibilities, and terms.",
    },
    {
        id: "resume",
        name: "Resume / CV",
        category: "Personal & creative",
        description: "A one-page CV: summary, experience, skills, and projects.",
    },
    {
        id: "portfolio",
        name: "Portfolio",
        category: "Personal & creative",
        description: "Show the work. A hero, selected projects, services, and contact.",
    },
    {
        id: "personal-site",
        name: "Personal Site",
        category: "Personal & creative",
        description: "An intro, what you're working on, and how to get in touch.",
    },
    {
        id: "cover-letter",
        name: "Cover Letter",
        category: "Personal & creative",
        description: "A cover letter: why the company, why you, and a warm close.",
    },
    {
        id: "event-invite",
        name: "Event Invite",
        category: "Personal & creative",
        description: "An invitation page. The occasion, the details, a schedule, and RSVP.",
    },
    {
        id: "photo-essay",
        name: "Photo Essay",
        category: "Personal & creative",
        description: "A cover, an opening, and image after image.",
    },
    {
        id: "restaurant-menu",
        name: "Restaurant Menu",
        category: "Everyday documents",
        description: "A dinner menu: courses, prices, the wine list, and the story of the food.",
    },
    {
        id: "travel-itinerary",
        name: "Travel Itinerary",
        category: "Everyday documents",
        description: "A trip, day by day: the route, the stops, bookings, and a packing list.",
    },
    {
        id: "real-estate-listing",
        name: "Property Listing",
        category: "Everyday documents",
        description: "One house, well told: photos, key facts, specs, and the agent.",
    },
    {
        id: "guest-guide",
        name: "Guest Guide",
        category: "Everyday documents",
        description:
            "A welcome book for your place: getting in, wifi, house notes, and local picks.",
    },
];
