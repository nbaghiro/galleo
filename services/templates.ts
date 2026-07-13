import type { ArtifactContent } from "@model/artifact";
import {
    eventInvite,
    photoEssay,
    coverLetter,
    personalSite,
    portfolio,
    resume,
} from "./templates/creative";
import {
    agencySite,
    newsletter,
    eventPage,
    waitlistPage,
    landingPage,
    productLaunch,
} from "./templates/marketing";
import {
    companyOverview,
    gtmPlan,
    productDemo,
    seriesA,
    salesDeck,
    startupPitch,
} from "./templates/pitch";
import {
    sow,
    sponsorshipDeck,
    boardDeck,
    businessProposal,
    investorUpdate,
    projectProposal,
} from "./templates/proposals";
import {
    qbr,
    trendsReport,
    marketAnalysis,
    researchReport,
    annualReport,
    caseStudy,
} from "./templates/reports";

export interface Template {
    id: string;
    name: string;
    category: string;
    description: string;
    artifact: ArtifactContent;
}

export const TEMPLATES: Template[] = [
    {
        id: "startup-pitch",
        name: "Startup Pitch Deck",
        category: "Pitch & sales",
        description: "Raise your round — problem, solution, market, traction, and the ask.",
        artifact: startupPitch,
    },
    {
        id: "sales-deck",
        name: "Sales Deck",
        category: "Pitch & sales",
        description: "Win the deal — the buyer's problem, your solution, proof, and pricing.",
        artifact: salesDeck,
    },
    {
        id: "series-a",
        name: "Series A Deck",
        category: "Pitch & sales",
        description: "Raise your A — the market shift, traction, unit economics, and the raise.",
        artifact: seriesA,
    },
    {
        id: "product-demo",
        name: "Product Demo Deck",
        category: "Pitch & sales",
        description: "Walk through the product — the pain, the features, results, and pricing.",
        artifact: productDemo,
    },
    {
        id: "company-overview",
        name: "Company Overview",
        category: "Pitch & sales",
        description: "Who you are — what you do, your products, the numbers, and the team.",
        artifact: companyOverview,
    },
    {
        id: "gtm-plan",
        name: "Go-to-Market Plan",
        category: "Pitch & sales",
        description: "Launch a product — segments, positioning, channels, pricing, and KPIs.",
        artifact: gtmPlan,
    },
    {
        id: "annual-report",
        name: "Annual Report",
        category: "Reports & research",
        description: "The year in review — letter, the numbers, financials, and what's next.",
        artifact: annualReport,
    },
    {
        id: "case-study",
        name: "Case Study",
        category: "Reports & research",
        description: "Challenge to results, with the numbers and a customer quote.",
        artifact: caseStudy,
    },
    {
        id: "research-report",
        name: "Research Report",
        category: "Reports & research",
        description: "A whitepaper — findings, the data, implications, and recommendations.",
        artifact: researchReport,
    },
    {
        id: "market-analysis",
        name: "Market Analysis",
        category: "Reports & research",
        description: "Size a market — growth, segments, competition, and the outlook.",
        artifact: marketAnalysis,
    },
    {
        id: "qbr",
        name: "Quarterly Business Review",
        category: "Reports & research",
        description: "A QBR — KPIs vs targets, pipeline, wins, misses, and priorities.",
        artifact: qbr,
    },
    {
        id: "trends-report",
        name: "Industry Trends Report",
        category: "Reports & research",
        description: "The trends shaping a sector — the data, analysis, and predictions.",
        artifact: trendsReport,
    },
    {
        id: "product-launch",
        name: "Product Launch",
        category: "Marketing & web",
        description: "A launch site — hero, features, how it works, proof, and pricing.",
        artifact: productLaunch,
    },
    {
        id: "landing-page",
        name: "Landing Page",
        category: "Marketing & web",
        description: "A SaaS landing page — benefits, a demo, testimonials, and tiers.",
        artifact: landingPage,
    },
    {
        id: "event-page",
        name: "Event Page",
        category: "Marketing & web",
        description: "A conference site — speakers, the agenda, tickets, and a register CTA.",
        artifact: eventPage,
    },
    {
        id: "waitlist-page",
        name: "Waitlist Page",
        category: "Marketing & web",
        description: "A coming-soon page — the vision, a sneak peek, and a waitlist CTA.",
        artifact: waitlistPage,
    },
    {
        id: "agency-site",
        name: "Agency Site",
        category: "Marketing & web",
        description: "A studio website — services, selected work, your approach, and contact.",
        artifact: agencySite,
    },
    {
        id: "newsletter",
        name: "Newsletter",
        category: "Marketing & web",
        description: "A newsletter issue — editor's note, the lead story, items, and links.",
        artifact: newsletter,
    },
    {
        id: "project-proposal",
        name: "Project Proposal",
        category: "Proposals & updates",
        description: "Pitch the work — approach, scope, timeline, team, and investment.",
        artifact: projectProposal,
    },
    {
        id: "investor-update",
        name: "Investor Update",
        category: "Proposals & updates",
        description: "Your monthly update — metrics, growth, wins, challenges, and asks.",
        artifact: investorUpdate,
    },
    {
        id: "business-proposal",
        name: "Business Proposal",
        category: "Proposals & updates",
        description: "A formal proposal — the solution, scope, timeline, pricing, and terms.",
        artifact: businessProposal,
    },
    {
        id: "board-deck",
        name: "Board Deck",
        category: "Proposals & updates",
        description: "A quarterly board update — KPIs, financials, risks, and priorities.",
        artifact: boardDeck,
    },
    {
        id: "sponsorship-deck",
        name: "Sponsorship Proposal",
        category: "Proposals & updates",
        description: "Win sponsors — your audience, reach, tiers, benefits, and the ask.",
        artifact: sponsorshipDeck,
    },
    {
        id: "sow",
        name: "Statement of Work",
        category: "Proposals & updates",
        description: "An SOW — scope, deliverables, timeline, responsibilities, and terms.",
        artifact: sow,
    },
    {
        id: "resume",
        name: "Resume / CV",
        category: "Personal & creative",
        description: "An elegant one-page CV — summary, experience, skills, and projects.",
        artifact: resume,
    },
    {
        id: "portfolio",
        name: "Portfolio",
        category: "Personal & creative",
        description: "Show the work — a hero, selected projects, services, and contact.",
        artifact: portfolio,
    },
    {
        id: "personal-site",
        name: "Personal Site",
        category: "Personal & creative",
        description: "An about / bio site — an intro, what you're working on, and contact.",
        artifact: personalSite,
    },
    {
        id: "cover-letter",
        name: "Cover Letter",
        category: "Personal & creative",
        description: "An elegant cover letter — why the company, why you, and a warm close.",
        artifact: coverLetter,
    },
    {
        id: "event-invite",
        name: "Event Invite",
        category: "Personal & creative",
        description: "An invitation page — the occasion, the details, a schedule, and RSVP.",
        artifact: eventInvite,
    },
    {
        id: "photo-essay",
        name: "Photo Essay",
        category: "Personal & creative",
        description: "A visual story — a cover, an opening, and image after image.",
        artifact: photoEssay,
    },
];
