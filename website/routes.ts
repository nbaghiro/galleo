import { DOC_ARTICLES, docFor } from "./docs";
export const LEGAL_DOC_IDS = ["privacy", "terms"] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];
export const LEGAL_PATHS: Record<LegalDocId, string> = { privacy: "/privacy", terms: "/terms" };

export function legalDocFor(pathname: string): LegalDocId | null {
    const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return LEGAL_DOC_IDS.find((id) => LEGAL_PATHS[id] === path) ?? null;
}

type Section = { heading: string; body: string; items?: string[] };
export type MarketingPage = {
    path: string;
    title: string;
    description: string;
    heading: string;
    intro: string;
    sections: Section[];
    questions: { question: string; answer: string }[];
    templateId?: string;
};

export const MARKETING_PAGES: readonly MarketingPage[] = [
    {
        path: "/ai-presentation-maker",
        title: "AI Presentation Maker for Editable Decks | Galleo",
        description:
            "Create an editable presentation with AI. Refine slides, charts and themes, present live, and reuse the same content as a document or website with Galleo.",
        heading: "An AI presentation maker for the whole story",
        intro: "Start with a brief, build a deck, then refine the argument slide by slide. Galleo keeps your text, charts and layout editable, so the first draft is a starting point you can work with.",
        sections: [
            {
                heading: "From a brief to a presentation",
                body: "Describe your audience, the decision you want them to make and the material you have. Review the outline before building the slides. Add your own facts and sources, then use the editor to adjust wording, section order and visual emphasis.",
                items: [
                    "Pitch an idea to investors or colleagues.",
                    "Explain a product with diagrams and comparison tables.",
                    "Present a project update with charts and next steps.",
                ],
            },
            {
                heading: "Edit the content and the design",
                body: "Change a theme across the deck or adjust individual elements on the canvas. Text, images, charts, tables and diagrams remain separate parts of the presentation. You can revise a chart or shorten a paragraph without rebuilding the slide as an image.",
            },
            {
                heading: "Present, export and send a follow-up",
                body: "Present from Galleo or export your work. PDF and PNG exports are available on the free plan with a Galleo mark; paid plans include PowerPoint export. Switch the same content to a reading document or published web page when your audience needs another format.",
            },
        ],
        questions: [
            {
                question: "Can I edit an AI-generated presentation?",
                answer: "Yes. The generated content uses the same editable elements as a presentation you build by hand. Revise the copy, change the theme and move or resize elements in the editor.",
            },
            {
                question: "Can I export a PowerPoint file?",
                answer: "PowerPoint export is available on paid plans. Check the pricing page for the current export options and AI credit allowances.",
            },
            {
                question: "Do I need to check the AI draft?",
                answer: "Yes. Review facts, figures, sources and wording before presenting or publishing. AI helps assemble a draft; you decide what belongs in the final version.",
            },
        ],
    },
    {
        path: "/visual-documents",
        title: "AI Visual Document Creator | Galleo",
        description:
            "Create visual documents with editable text, charts, diagrams and tables. Turn a brief into a report or proposal and reuse the content as a presentation or website.",
        heading: "Visual documents built to explain",
        intro: "Give reports, proposals and project briefs a clear structure. Combine writing with charts, diagrams and images in a document your reader can follow, then keep refining it in the editor.",
        sections: [
            {
                heading: "Make the argument easy to follow",
                body: "Start with the question your document answers. Add a summary, explain the evidence and end with a decision or next step. Galleo's AI can help turn a brief into that structure, while you keep control of the claims and supporting material.",
            },
            {
                heading: "Put evidence beside the explanation",
                body: "Use tables for comparisons, charts for trends and diagrams for relationships. Arrange text and visual elements together instead of sending readers between a paragraph and a separate attachment.",
                items: [
                    "A project brief with scope, timeline and responsibilities.",
                    "A proposal with the approach, deliverables and pricing.",
                    "A report with findings, charts and recommendations.",
                ],
            },
            {
                heading: "One document, more ways to share",
                body: "Export a PDF for a fixed reading copy or publish a link for online reading. The same content can also become a deck for a meeting. Formats reflow from one source, so you do not have to maintain three separate copies of the text.",
            },
        ],
        questions: [
            {
                question: "What is a visual document?",
                answer: "A document that uses writing and visual elements together to communicate an idea. Examples include a report with charts, a proposal with a timeline and a brief with a process diagram.",
            },
            {
                question: "Can I turn a presentation into a document?",
                answer: "Yes. Galleo can show the same content as a deck, document or web page. Review the result in each format and adjust the content for the way your audience will read it.",
            },
            {
                question: "Can I work with other people?",
                answer: "Galleo supports sharing, comments and live editing. Workspace membership and administrative features depend on the plan.",
            },
        ],
    },
    {
        path: "/ai-landing-page-builder",
        title: "AI Landing Page Builder | Galleo",
        description:
            "Build a landing page with AI, edit its content and theme, and publish a Galleo link. Reuse your page as a presentation or visual document from the same source.",
        heading: "Build a landing page from your idea",
        intro: "Explain an offer, introduce a project or share a campaign on a web page. Draft it with AI, edit the sections and publish a link from Galleo without writing page code.",
        sections: [
            {
                heading: "Give the page one clear purpose",
                body: "Tell Galleo who the page is for and what the visitor should do next. Organize the page around the offer, the evidence behind it and a clear call to action. Replace draft claims and example details with information you can stand behind.",
            },
            {
                heading: "Build with content blocks",
                body: "Combine headlines, images, feature comparisons, pricing tables and forms. Apply a theme for consistent typography and colour, then adjust the layout and content in the editor.",
                items: [
                    "Introduce a service and explain the next step.",
                    "Share an event overview and collect responses.",
                    "Publish a project page with background and supporting visuals.",
                ],
            },
            {
                heading: "Publish a link and reuse your work",
                body: "Publish the page on a Galleo share link and choose its access settings. Preview it at different widths before sharing. You can also show the same material as a deck or document, useful when a campaign needs both a page and a presentation.",
            },
        ],
        questions: [
            {
                question: "Do I need to write HTML or CSS?",
                answer: "No. Create and edit the page with Galleo's content elements and visual controls. The web format handles how the content is laid out.",
            },
            {
                question: "Where is the page hosted?",
                answer: "Published pages are available through a Galleo share URL. Custom-domain hosting is not currently offered.",
            },
            {
                question: "Will my published page rank on Google?",
                answer: "Publishing a page does not guarantee indexing or rankings. Search visibility depends on crawlability, useful original content and other signals. Review access settings before sharing a page publicly.",
            },
        ],
    },
    {
        path: "/presentation-templates",
        title: "Presentation Templates for Pitches and Sales | Galleo",
        description:
            "Find a starting structure for a pitch, sales presentation or project update. Customize Galleo templates with your own evidence, visuals and theme.",
        heading: "Presentation templates with a clear starting structure",
        intro: "A template gives you a sequence to work from. Choose the story you need to tell, replace the example material with your own and adapt the design to your audience.",
        sections: [
            {
                heading: "Choose the job before the layout",
                body: "An investor pitch asks someone to believe in a business. A sales deck helps a buyer evaluate a decision. Start with a template that fits the conversation, then remove sections that do not serve it.",
            },
            {
                heading: "Make the template yours",
                body: "Add your own numbers, sources and images. Keep the useful structure, change the headings and choose a theme that suits the material. Templates are editable content, not finished claims about your business.",
            },
            {
                heading: "Continue in the template library",
                body: "Sign in to browse the full starter library in Galleo. Open a preview, choose a template and edit the copy. The same work can be read as a document or published as a web page.",
            },
        ],
        questions: [
            {
                question: "Are these finished presentations?",
                answer: "No. Templates contain example material and a suggested structure. Replace the examples and verify every claim before using the presentation.",
            },
        ],
    },
    {
        path: "/presentation-templates/startup-pitch",
        title: "Startup Pitch Deck Template | Galleo",
        description:
            "Structure a startup pitch around the problem, solution, market, traction and ask. Customize an editable pitch deck template in Galleo.",
        heading: "A startup pitch deck template for your next investor conversation",
        intro: "Help an investor understand the problem, why your solution matters and what the next round would make possible. Use the structure as a guide, then build the case with your own evidence.",
        templateId: "startup-pitch",
        sections: [
            {
                heading: "Start with the customer and the problem",
                body: "Explain whose problem you solve and how they handle it today. A specific example is more useful than an unsupported market claim. Show your product in the context of that problem.",
            },
            {
                heading: "Connect the opportunity to the evidence",
                body: "Separate what you have measured from what you expect. Define the period and source for each metric, explain your business model and show how the team can execute.",
                items: [
                    "Problem and customer: a concrete situation worth solving.",
                    "Solution and market: your approach and the buyers it serves.",
                    "Traction: usage, revenue or other evidence with dates and definitions.",
                    "Team and ask: the people, the funding and what it enables.",
                ],
            },
            {
                heading: "Prepare the deck and the follow-up",
                body: "Keep the live presentation focused on the argument. Add the supporting detail your investor will need for review, then use the document format for a reading copy. Before sending, check that every number agrees across the sections.",
            },
        ],
        questions: [
            {
                question: "How many slides should a startup pitch have?",
                answer: "Use enough to explain the business and the ask within the time you have. A shorter deck with clear evidence is more useful than adding slides to meet a fixed count.",
            },
        ],
    },
    {
        path: "/presentation-templates/sales-deck",
        title: "Sales Deck Template for Buyer Conversations | Galleo",
        description:
            "Create a sales presentation around the buyer's problem, your solution, evidence and pricing. Customize Galleo's editable sales deck template.",
        heading: "A sales deck that starts with the buyer",
        intro: "Build a presentation around the decision your buyer needs to make. Use the template to connect their problem to your solution, support it with evidence and make the next step clear.",
        templateId: "sales-deck",
        sections: [
            {
                heading: "Describe the problem in the buyer's terms",
                body: "Explain the current process and where it falls short. Use the language and constraints you learned in discovery. Avoid opening with a long company history before the buyer knows why the conversation matters.",
            },
            {
                heading: "Show how the offer fits",
                body: "Walk through the relevant workflow, then give evidence for the outcome you claim. Use a comparison table when there are tradeoffs, and label examples as examples rather than presenting them as customer results.",
                items: [
                    "The buyer's situation and the cost of leaving it unchanged.",
                    "The proposed solution and how it fits their workflow.",
                    "Relevant proof, implementation requirements and limitations.",
                    "Pricing, responsibilities and a concrete next step.",
                ],
            },
            {
                heading: "Make the follow-up useful",
                body: "Include the details the buyer needs to share internally: scope, pricing assumptions and next steps. Reuse the presentation as a visual document so the follow-up has the same source as the meeting deck.",
            },
        ],
        questions: [
            {
                question: "Can I customize the deck for each prospect?",
                answer: "Yes. Edit the copy, visuals and structure for the prospect's situation. Check any reused figures or customer claims before sharing a new version.",
            },
        ],
    },
];

export function marketingPageFor(pathname: string): MarketingPage | undefined {
    return MARKETING_PAGES.find((page) => page.path === pathname.replace(/\/$/, ""));
}

export const PUBLIC_PATHS = [
    "/",
    "/docs",
    ...DOC_ARTICLES.map((article) => `/docs/${article.slug}`),
    ...MARKETING_PAGES.map((page) => page.path),
    ...Object.values(LEGAL_PATHS),
];

export function metadataFor(pathname: string): { title: string; description: string } {
    const doc = docFor(pathname);
    if (doc) return { title: `${doc.title} | Galleo Docs`, description: doc.description };
    if (pathname === "/docs")
        return {
            title: "Product Documentation and Guides | Galleo",
            description:
                "Learn how to create, edit, share, and export presentations, visual documents, and websites with Galleo. Explore practical guides for every workflow.",
        };
    const page = marketingPageFor(pathname);
    if (page) return page;
    const legal = legalDocFor(pathname);
    if (legal)
        return {
            title: `${legal === "privacy" ? "Privacy Policy" : "Terms of Service"} | Galleo`,
            description:
                legal === "privacy"
                    ? "Read Galleo's privacy policy and how the service handles your information."
                    : "Read the terms for using Galleo's content creation and publishing service.",
        };
    return {
        title: "Galleo | AI Presentations, Visual Docs & Websites",
        description:
            "Create presentations, visual documents and websites with AI. Edit your content once, switch formats, and export or publish your work with Galleo.",
    };
}
