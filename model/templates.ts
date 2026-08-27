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
        category: "Pitch & sell",
        description: "Raise your round: problem, solution, market, traction, and the ask.",
    },
    {
        id: "series-a",
        name: "Series A Deck",
        category: "Pitch & sell",
        description: "The market shift, traction, unit economics, and the raise.",
    },
    {
        id: "sales-deck",
        name: "Sales Deck",
        category: "Pitch & sell",
        description: "Win the deal. The buyer's problem, your solution, proof, and pricing.",
    },
    {
        id: "product-demo",
        name: "Product Demo Deck",
        category: "Pitch & sell",
        description: "Walk through the product: the pain, the features, results, and pricing.",
    },
    {
        id: "sponsorship-deck",
        name: "Sponsorship Proposal",
        category: "Pitch & sell",
        description: "Win sponsors. Your audience, reach, tiers, benefits, and the ask.",
    },
    {
        id: "exec-summary",
        name: "Executive Summary",
        category: "Pitch & sell",
        description: "The raise in two pages: problem, product, traction, and the ask.",
    },
    {
        id: "product-sheet",
        name: "Product One-Pager",
        category: "Pitch & sell",
        description: "A datasheet: what it does, how it works, specs, and pricing.",
    },
    {
        id: "fact-sheet",
        name: "Company Fact Sheet",
        category: "Pitch & sell",
        description: "The numbers, milestones, leadership, and boilerplate, on one page.",
    },
    {
        id: "partnership-pitch",
        name: "Partnership Proposal",
        category: "Pitch & sell",
        description: "Propose a collaboration: the fit, the shape of it, and the terms.",
    },
    {
        id: "about-page",
        name: "About Page",
        category: "Pitch & sell",
        description: "The company story: how it started, what you believe, who you are.",
    },
    {
        id: "demo-page",
        name: "Demo Booking Page",
        category: "Pitch & sell",
        description: "Sell the meeting: what they'll see, the agenda, and a time picker.",
    },
    {
        id: "wall-of-love",
        name: "Wall of Love",
        category: "Pitch & sell",
        description: "A testimonials page: customer words, the numbers, and a CTA.",
    },
    {
        id: "solution-page",
        name: "Solution Page",
        category: "Pitch & sell",
        description: "Your product for one audience: their pain, your fit, the proof.",
    },
    {
        id: "compare-page",
        name: "Comparison Page",
        category: "Pitch & sell",
        description: "You versus the incumbent, honestly: the table, the losses, the switch.",
    },
    {
        id: "investor-update",
        name: "Investor Update",
        category: "Pitch & sell",
        description: "Your monthly update. Metrics, growth, wins, challenges, and asks.",
    },
    {
        id: "product-launch",
        name: "Product Launch",
        category: "Launch & market",
        description: "A launch site: hero, features, how it works, proof, and pricing.",
    },
    {
        id: "landing-page",
        name: "Landing Page",
        category: "Launch & market",
        description: "A SaaS landing page. Benefits, a demo, testimonials, and tiers.",
    },
    {
        id: "event-page",
        name: "Event Page",
        category: "Launch & market",
        description: "Speakers, the agenda, tickets, and a register CTA.",
    },
    {
        id: "waitlist-page",
        name: "Waitlist Page",
        category: "Launch & market",
        description: "A coming-soon page: the vision, a sneak peek, and a waitlist CTA.",
    },
    {
        id: "gtm-plan",
        name: "Go-to-Market Plan",
        category: "Launch & market",
        description: "Segments, positioning, channels, pricing, and KPIs for a launch.",
    },
    {
        id: "newsletter",
        name: "Newsletter",
        category: "Launch & market",
        description: "An editor's note, the lead story, items, and links.",
    },
    {
        id: "campaign-pitch",
        name: "Campaign Pitch",
        category: "Launch & market",
        description: "Sell the big idea: insight, executions, channels, and budget.",
    },
    {
        id: "brand-guidelines",
        name: "Brand Guidelines",
        category: "Launch & market",
        description: "The mark, color, type, voice, and photography, with the rules.",
    },
    {
        id: "announcement-keynote",
        name: "Announcement Keynote",
        category: "Launch & market",
        description: "The unveil: a tease, the reveal, the features, one price, one date.",
    },
    {
        id: "launch-briefing",
        name: "Launch Briefing",
        category: "Launch & market",
        description: "Brief the team: what ships, who owns what, and the day itself.",
    },
    {
        id: "release-notes",
        name: "Release Notes",
        category: "Launch & market",
        description: "What shipped this month: the big one, the fixes, the goodbyes.",
    },
    {
        id: "press-kit",
        name: "Press Kit",
        category: "Launch & market",
        description: "The announcement, fast facts, quotes, and assets, ready to file.",
    },
    {
        id: "launch-playbook",
        name: "Launch Playbook",
        category: "Launch & market",
        description: "T-minus 30 to T-plus 30: the checklist, owners, and the go/no-go bar.",
    },
    {
        id: "messaging-guide",
        name: "Messaging Guide",
        category: "Launch & market",
        description: "Positioning, pillars, and the exact words, so everyone sounds alike.",
    },
    {
        id: "pricing-page",
        name: "Pricing Page",
        category: "Launch & market",
        description: "Three plans, the fine print in a table, and the honest FAQ.",
    },
    {
        id: "company-overview",
        name: "Company Overview",
        category: "Client work",
        description: "Who you are. What you do, your products, the numbers, and the team.",
    },
    {
        id: "agency-site",
        name: "Agency Site",
        category: "Client work",
        description: "A studio website. Services, selected work, your approach, and contact.",
    },
    {
        id: "project-proposal",
        name: "Project Proposal",
        category: "Client work",
        description: "Pitch the work: approach, scope, timeline, team, and investment.",
    },
    {
        id: "business-proposal",
        name: "Business Proposal",
        category: "Client work",
        description: "The solution, scope, timeline, pricing, and terms, formally set out.",
    },
    {
        id: "sow",
        name: "Statement of Work",
        category: "Client work",
        description: "Scope, deliverables, timeline, responsibilities, and terms.",
    },
    {
        id: "case-study",
        name: "Case Study",
        category: "Client work",
        description: "Challenge to results, with the numbers and a customer quote.",
    },
    {
        id: "kickoff-deck",
        name: "Kickoff Deck",
        category: "Client work",
        description: "Start the engagement: who's who, how we work, and week one.",
    },
    {
        id: "capabilities-deck",
        name: "Capabilities Deck",
        category: "Client work",
        description: "The studio in ten slides: practices, selected work, and process.",
    },
    {
        id: "workshop-deck",
        name: "Workshop Deck",
        category: "Client work",
        description: "Run the discovery day: the agenda, the exercises, the outputs.",
    },
    {
        id: "client-status",
        name: "Client Status Update",
        category: "Client work",
        description: "The weekly note: workstreams, what shipped, the flag, what's next.",
    },
    {
        id: "proposal-site",
        name: "Proposal Site",
        category: "Client work",
        description: "The proposal as a page: plan, team, investment, and one click to yes.",
    },
    {
        id: "project-hub",
        name: "Project Hub",
        category: "Client work",
        description: "One page for the build: status, timeline, decisions, and links.",
    },
    {
        id: "case-study-site",
        name: "Case Study Site",
        category: "Client work",
        description: "The customer story as a page, ending in a demo CTA.",
    },
    {
        id: "services-page",
        name: "Services Page",
        category: "Client work",
        description: "What you offer, what it costs, how it runs, and how to enquire.",
    },
    {
        id: "real-estate-listing",
        name: "Property Listing",
        category: "Client work",
        description: "One house, well told: photos, key facts, specs, and the agent.",
    },
    {
        id: "annual-report",
        name: "Annual Report",
        category: "Reports & reviews",
        description: "The year in review: letter, the numbers, financials, and what's next.",
    },
    {
        id: "qbr",
        name: "Quarterly Business Review",
        category: "Reports & reviews",
        description: "A QBR: KPIs vs targets, pipeline, wins, misses, and priorities.",
    },
    {
        id: "board-deck",
        name: "Board Deck",
        category: "Reports & reviews",
        description: "A quarterly board update: KPIs, financials, risks, and priorities.",
    },
    {
        id: "research-report",
        name: "Research Report",
        category: "Reports & reviews",
        description: "A whitepaper. Findings, the data, implications, and recommendations.",
    },
    {
        id: "market-analysis",
        name: "Market Analysis",
        category: "Reports & reviews",
        description: "Growth, segments, competition, and the outlook for a market.",
    },
    {
        id: "trends-report",
        name: "Industry Trends Report",
        category: "Reports & reviews",
        description: "The trends shaping a sector, with the data, analysis, and predictions.",
    },
    {
        id: "all-hands",
        name: "All-Hands Deck",
        category: "Reports & reviews",
        description: "The monthly meeting: the scoreboard, the hard thing, and shoutouts.",
    },
    {
        id: "growth-review",
        name: "Growth Review",
        category: "Reports & reviews",
        description: "Every channel against target, what worked, and where budget moves.",
    },
    {
        id: "research-readout",
        name: "Research Readout",
        category: "Reports & reviews",
        description: "The study in twenty minutes: four findings and what to do with them.",
    },
    {
        id: "annual-plan",
        name: "Annual Plan",
        category: "Reports & reviews",
        description: "Next year on a wall: priorities, targets, and the close that rallies.",
    },
    {
        id: "impact-site",
        name: "Impact Report Site",
        category: "Reports & reviews",
        description: "The year in public: numbers, stories, goals, and the full PDF.",
    },
    {
        id: "research-site",
        name: "Research Report Site",
        category: "Reports & reviews",
        description: "The study as a page: topline stats, findings, method, download.",
    },
    {
        id: "changelog-site",
        name: "Changelog Site",
        category: "Reports & reviews",
        description: "Every release, newest first, written like you mean it.",
    },
    {
        id: "open-metrics",
        name: "Open Metrics Page",
        category: "Reports & reviews",
        description: "Your dashboard in public: the numbers, the table, the honest note.",
    },
    {
        id: "status-page",
        name: "Status Page",
        category: "Reports & reviews",
        description: "Live systems, ninety days of uptime, and the incident record.",
    },
    {
        id: "event-invite",
        name: "Event Invite",
        category: "Everyday & occasions",
        description: "An invitation page. The occasion, the details, a schedule, and RSVP.",
    },
    {
        id: "event-program",
        name: "Event Program",
        category: "Everyday & occasions",
        description: "A printed program: the running order, the performers, and the thanks.",
    },
    {
        id: "travel-itinerary",
        name: "Travel Itinerary",
        category: "Everyday & occasions",
        description: "A trip, day by day: the route, the stops, bookings, and a packing list.",
    },
    {
        id: "restaurant-menu",
        name: "Restaurant Menu",
        category: "Everyday & occasions",
        description: "A dinner menu: courses, prices, the wine list, and the story of the food.",
    },
    {
        id: "recipe-collection",
        name: "Recipe Collection",
        category: "Everyday & occasions",
        description: "Recipes worth keeping: ingredients, method, and the notes that matter.",
    },
    {
        id: "guest-guide",
        name: "Guest Guide",
        category: "Everyday & occasions",
        description:
            "A welcome book for your place: getting in, wifi, house notes, and local picks.",
    },
    {
        id: "celebration-slideshow",
        name: "Celebration Slideshow",
        category: "Everyday & occasions",
        description: "The pictures before the first dance: the story, the years, the thanks.",
    },
    {
        id: "trivia-night",
        name: "Trivia Night",
        category: "Everyday & occasions",
        description: "Run the quiz: rules, rounds, the tiebreaker, and the prizes.",
    },
    {
        id: "travel-recap",
        name: "Travel Recap",
        category: "Everyday & occasions",
        description: "The trip debrief: numbers, the podium, and honorable failures.",
    },
    {
        id: "birthday-toast",
        name: "Birthday Toast",
        category: "Everyday & occasions",
        description: "The slides before cake: decades, numbers, and glasses raised.",
    },
    {
        id: "book-club",
        name: "Book Club Season",
        category: "Everyday & occasions",
        description: "The reading list, the house rules, and who hosts which month.",
    },
    {
        id: "party-invite",
        name: "Party Invite",
        category: "Everyday & occasions",
        description: "An invitation page: the details, the night's shape, and RSVP.",
    },
    {
        id: "reunion-site",
        name: "Reunion Site",
        category: "Everyday & occasions",
        description: "Get everyone back in a room: the night, the numbers, RSVP.",
    },
    {
        id: "restaurant-site",
        name: "Restaurant Site",
        category: "Everyday & occasions",
        description: "The room, tonight's menu, the farms, and a reserve button.",
    },
    {
        id: "rental-site",
        name: "Rental Listing Site",
        category: "Everyday & occasions",
        description: "Your place, well shown: photos, amenities, reviews, and booking.",
    },
    {
        id: "portfolio",
        name: "Portfolio",
        category: "You & your work",
        description: "Show the work. A hero, selected projects, services, and contact.",
    },
    {
        id: "personal-site",
        name: "Personal Site",
        category: "You & your work",
        description: "An intro, what you're working on, and how to get in touch.",
    },
    {
        id: "resume",
        name: "Resume / CV",
        category: "You & your work",
        description: "A one-page CV: summary, experience, skills, and projects.",
    },
    {
        id: "cover-letter",
        name: "Cover Letter",
        category: "You & your work",
        description: "A cover letter: why the company, why you, and a warm close.",
    },
    {
        id: "photo-essay",
        name: "Photo Essay",
        category: "You & your work",
        description: "A cover, an opening, and image after image.",
    },
    {
        id: "conference-talk",
        name: "Conference Talk",
        category: "You & your work",
        description: "The claim, three lessons, and a closing worth quoting.",
    },
    {
        id: "portfolio-deck",
        name: "Portfolio Deck",
        category: "You & your work",
        description: "Three projects, the decisions inside them, and how you work.",
    },
    {
        id: "teaching-deck",
        name: "Workshop Deck",
        category: "You & your work",
        description: "Teach the room: the premise, the exercises, and the one rule.",
    },
    {
        id: "year-in-review",
        name: "Year in Review",
        category: "You & your work",
        description: "Your year, counted honestly: seasons, numbers, and lessons.",
    },
    {
        id: "side-project-pitch",
        name: "Side Project Pitch",
        category: "You & your work",
        description: "The small pitch: what it is, the real numbers, and the ask.",
    },
    {
        id: "design-case-study",
        name: "Design Case Study",
        category: "You & your work",
        description: "One project, written up properly: problem, bet, numbers, mistakes.",
    },
    {
        id: "speaker-kit",
        name: "Speaker Kit",
        category: "You & your work",
        description: "The one-sheet: bios in two sizes, the talks, and logistics.",
    },
    {
        id: "link-hub",
        name: "Link Hub",
        category: "You & your work",
        description: "One page with all your doors: the work, the letter, the hellos.",
    },
    {
        id: "speaking-page",
        name: "Speaking Page",
        category: "You & your work",
        description: "Your talks, what hosts say, and how to book you.",
    },
    {
        id: "app-site",
        name: "App Site",
        category: "You & your work",
        description: "A small product's home: how it works, the philosophy, one price.",
    },
];
