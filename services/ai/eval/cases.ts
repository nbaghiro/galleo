// The agent-quality eval suite — a spread of real chat requests with the tool/block behavior each SHOULD
// produce, so a model's tool routing (not just its prose) can be scored objectively and compared. Covers
// the read spine, edit-a-target, management, generation, repurpose, guarded share/export, editor-surface
// refine, and — crucially — RESTRAINT (conversational asks that must NOT trigger a tool). Grounded in the
// demo library (Series A Deck, Newsletter, Aria …); run the seed first so `find-artifacts` resolves.

export type EvalSurface = "library" | "editor";

export interface EvalCase {
    id: string;
    category: string;
    surface: EvalSurface;
    message: string;
    intent: string; // what a correct run does
    expectTools?: string[]; // ALL must be called (any order)
    forbidTools?: string[]; // NONE may be called
    expectBlocks?: string[]; // block types that must appear (proposal/brief/action/artifacts/templates/…)
    forbidBlocks?: string[]; // block types that must NOT appear
    conversational?: boolean; // pass ⇒ no tools AND no blocks (pure text answer)
}

export const EVAL_CASES: EvalCase[] = [
    // ---- read spine ----
    {
        id: "read-summarize",
        category: "read",
        surface: "library",
        message: "Summarize my Series A deck in two sentences.",
        intent: "find it, read it, summarize from real content",
        expectTools: ["find-artifacts", "read-artifact"],
        forbidBlocks: ["proposal", "action", "brief"],
    },
    {
        id: "read-topic",
        category: "read",
        surface: "library",
        message: "What is my Aria artifact actually about?",
        intent: "find + read Aria, answer from content",
        expectTools: ["find-artifacts", "read-artifact"],
        forbidBlocks: ["proposal", "action", "brief"],
    },
    {
        id: "read-search",
        category: "read",
        surface: "library",
        message: "Which of my artifacts is a fundraising pitch?",
        intent: "search the library",
        expectTools: ["find-artifacts"],
        forbidBlocks: ["proposal", "action", "brief"],
    },
    // ---- edit a named artifact ----
    {
        id: "edit-title",
        category: "edit-target",
        surface: "library",
        message: "Make the title/opening of my Series A deck punchier.",
        intent: "find → read → edit-artifact → a proposal",
        expectTools: ["find-artifacts", "read-artifact", "edit-artifact"],
        expectBlocks: ["proposal"],
    },
    {
        id: "edit-formal",
        category: "edit-target",
        surface: "library",
        message: "Rewrite the opening section of my Series A deck to sound more formal.",
        intent: "find → read → edit-artifact → a proposal",
        expectTools: ["find-artifacts", "read-artifact", "edit-artifact"],
        expectBlocks: ["proposal"],
    },
    // ---- management ----
    {
        id: "rename",
        category: "manage",
        surface: "library",
        message: "Rename my Newsletter to Weekly Digest.",
        intent: "find → rename-artifact → action",
        expectTools: ["find-artifacts", "rename-artifact"],
        expectBlocks: ["action"],
    },
    {
        id: "move",
        category: "manage",
        surface: "library",
        message: "Move my Series A deck into the Personal folder.",
        intent: "find → move-artifact (resolve folder id) → action",
        expectTools: ["find-artifacts", "move-artifact"],
        expectBlocks: ["action"],
    },
    {
        id: "duplicate",
        category: "manage",
        surface: "library",
        message: "Duplicate my Series A deck so I can make a variant.",
        intent: "find → duplicate-artifact → action",
        expectTools: ["find-artifacts", "duplicate-artifact"],
        expectBlocks: ["action"],
    },
    {
        id: "trash",
        category: "manage-destructive",
        surface: "library",
        message: "Delete my Newsletter.",
        intent: "find → trash-artifact (client confirms) → action",
        expectTools: ["find-artifacts", "trash-artifact"],
        expectBlocks: ["action"],
    },
    {
        id: "create-folder",
        category: "manage",
        surface: "library",
        message: "Create a new folder called Clients.",
        intent: "create-folder → action",
        expectTools: ["create-folder"],
        expectBlocks: ["action"],
    },
    // ---- generation + repurpose ----
    {
        id: "generate",
        category: "generate",
        surface: "library",
        message: "Make me a short deck about a coffee subscription startup for busy professionals.",
        intent: "propose-generation → a brief card",
        expectBlocks: ["brief"],
    },
    {
        id: "generate-vague",
        category: "restraint",
        surface: "library",
        message: "I'd like to make something new today.",
        intent: "too vague to build — ask ONE clarifying question, do NOT propose a brief",
        forbidBlocks: ["brief", "proposal", "action"],
    },
    {
        id: "repurpose",
        category: "generate",
        surface: "library",
        message: "Turn my Series A deck into a one-page document.",
        intent: "find → propose-generation with sourceArtifactId + doc surface",
        expectTools: ["find-artifacts"],
        expectBlocks: ["brief"],
    },
    {
        id: "templates",
        category: "templates",
        surface: "library",
        message: "What starter templates can I begin from?",
        intent: "find-templates → a templates pick-list",
        expectTools: ["find-templates"],
        expectBlocks: ["templates"],
    },
    // ---- guarded (share / export) ----
    {
        id: "share",
        category: "guarded",
        surface: "library",
        message: "Share my Series A deck with a colleague.",
        intent: "find → share-artifact (routes to the share panel) → action",
        expectTools: ["find-artifacts", "share-artifact"],
        expectBlocks: ["action"],
    },
    {
        id: "export",
        category: "guarded",
        surface: "library",
        message: "Export my Series A deck as a PDF.",
        intent: "find → export-artifact (routes to the editor) → action",
        expectTools: ["find-artifacts", "export-artifact"],
        expectBlocks: ["action"],
    },
    // ---- restraint (must NOT call a tool) ----
    {
        id: "capabilities",
        category: "restraint",
        surface: "library",
        message: "What can you help me with here?",
        intent: "explain capabilities — no tools, no blocks",
        conversational: true,
    },
    {
        id: "thanks",
        category: "restraint",
        surface: "library",
        message: "Thanks, that's really helpful!",
        intent: "acknowledge — no tools, no blocks",
        conversational: true,
    },
    {
        id: "credits",
        category: "restraint",
        surface: "library",
        message: "How many AI credits do I have left this month?",
        intent: "answer from context, don't act",
        forbidBlocks: ["proposal", "action", "brief"],
    },
    {
        id: "count",
        category: "restraint",
        surface: "library",
        message: "How many artifacts do I have in total?",
        intent: "answer from context/find, don't act",
        forbidBlocks: ["proposal", "action", "brief"],
    },
    // ---- editor-surface refine (an artifact is open) ----
    {
        id: "refine-add",
        category: "refine",
        surface: "editor",
        message: "Add a pricing section to this.",
        intent: "add-section on the open artifact → proposal",
        expectTools: ["add-section"],
        expectBlocks: ["proposal"],
    },
    {
        id: "refine-format",
        category: "refine",
        surface: "editor",
        message: "Turn this into a document instead of a deck.",
        intent: "set-format → proposal",
        expectTools: ["set-format"],
        expectBlocks: ["proposal"],
    },
    {
        id: "refine-theme",
        category: "refine",
        surface: "editor",
        message: "Give this a darker, moodier theme.",
        intent: "set-theme → proposal",
        expectTools: ["set-theme"],
        expectBlocks: ["proposal"],
    },
];
