// grounded in the demo library — run `pnpm seed` first so `find-artifacts` resolves

export type EvalSurface = "library" | "editor";

export interface ExpectArgs {
    targetArtifact?: string; // proposal.targetArtifactId === the artifact whose title contains this
    actionKind?: string;
    actionArtifact?: string; // action.id === the artifact whose title contains this
    actionFolder?: string; // move → action.folderId === the folder with this name
    actionTitleContains?: string; // rename → action.title contains this
    actionName?: string; // create-folder → action.name contains this
    briefSurface?: string;
    briefSource?: string; // repurpose → brief.sourceArtifactId === the artifact whose title contains this
}

export type JudgeWhat = "reply" | "proposalSection" | "brief";
export interface JudgeSpec {
    what: JudgeWhat;
    rubric: string;
    min?: number; // pass threshold (default 3)
}

export interface Step {
    message: string;
    expectTools?: string[]; // ALL must be called (any order)
    forbidTools?: string[]; // NONE may be called
    expectBlocks?: string[]; // block types that must appear (proposal/brief/action/artifacts/templates/…)
    forbidBlocks?: string[]; // block types that must NOT appear
    conversational?: boolean; // pass ⇒ no tools AND no blocks (pure text answer)
    expectArgs?: ExpectArgs;
    judge?: JudgeSpec; // output-quality rubric (only under --judge)
}

export interface EvalCase extends Partial<Step> {
    id: string;
    category: string;
    surface: EvalSurface;
    intent: string;
    turns?: Step[]; // multi-turn steps; overrides `message`
}

export const EVAL_CASES: EvalCase[] = [
    {
        id: "read-summarize",
        category: "read",
        surface: "library",
        message: "Summarize my Series A deck in two sentences.",
        intent: "find it, read it, summarize from real content",
        expectTools: ["find-artifacts", "read-artifact"],
        forbidBlocks: ["proposal", "action", "brief"],
        judge: {
            what: "reply",
            rubric: "A crisp ≤2-sentence summary of the Series A deck, grounded in its real content — no invented facts, no filler.",
        },
    },
    {
        id: "read-topic",
        category: "read",
        surface: "library",
        message: "What is my Aria artifact actually about?",
        intent: "find + read Aria, answer from content",
        expectTools: ["find-artifacts", "read-artifact"],
        forbidBlocks: ["proposal", "action", "brief"],
        judge: {
            what: "reply",
            rubric: "Accurately describes what the Aria artifact is about, grounded in its content (not a guess from the title).",
        },
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
    {
        id: "edit-title",
        category: "edit-target",
        surface: "library",
        message: "Make the title/opening of my Series A deck punchier.",
        intent: "find → read → edit-artifact on the RIGHT deck → a good, punchier proposal",
        expectTools: ["find-artifacts", "read-artifact", "edit-artifact"],
        expectBlocks: ["proposal"],
        expectArgs: { targetArtifact: "Series A" },
        judge: {
            what: "proposalSection",
            rubric: "The rewritten opening is punchier — shorter, more confident, higher-impact — while preserving the same meaning. Not generic filler or lorem.",
        },
    },
    {
        id: "edit-formal",
        category: "edit-target",
        surface: "library",
        message: "Rewrite the opening section of my Series A deck to sound more formal.",
        intent: "find → read → edit-artifact on the RIGHT deck → a more-formal proposal",
        expectTools: ["find-artifacts", "read-artifact", "edit-artifact"],
        expectBlocks: ["proposal"],
        expectArgs: { targetArtifact: "Series A" },
        judge: {
            what: "proposalSection",
            rubric: "The rewritten opening reads more formal/professional in tone while keeping the same substance and specifics.",
        },
    },
    {
        id: "rename",
        category: "manage",
        surface: "library",
        message: "Rename my Newsletter to Weekly Digest.",
        intent: "find → rename the RIGHT artifact to the RIGHT title → action",
        expectTools: ["find-artifacts", "rename-artifact"],
        expectBlocks: ["action"],
        expectArgs: {
            actionKind: "rename",
            actionArtifact: "Newsletter",
            actionTitleContains: "Weekly Digest",
        },
    },
    {
        id: "move",
        category: "manage",
        surface: "library",
        message: "Move my Series A deck into the Personal folder.",
        intent: "find → move the RIGHT artifact into the RIGHT folder → action",
        expectTools: ["find-artifacts", "move-artifact"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "move", actionArtifact: "Series A", actionFolder: "Personal" },
    },
    {
        id: "duplicate",
        category: "manage",
        surface: "library",
        message: "Duplicate my Series A deck so I can make a variant.",
        intent: "find → duplicate the RIGHT artifact → action",
        expectTools: ["find-artifacts", "duplicate-artifact"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "duplicate", actionArtifact: "Series A" },
    },
    {
        id: "trash",
        category: "manage-destructive",
        surface: "library",
        message: "Delete my Newsletter.",
        intent: "find → trash the RIGHT artifact (client confirms) → action",
        expectTools: ["find-artifacts", "trash-artifact"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "trash", actionArtifact: "Newsletter" },
    },
    {
        id: "create-folder",
        category: "manage",
        surface: "library",
        message: "Create a new folder called Clients.",
        intent: "create-folder with the RIGHT name → action",
        expectTools: ["create-folder"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "create-folder", actionName: "Clients" },
    },
    {
        id: "generate",
        category: "generate",
        surface: "library",
        message: "Make me a short deck about a coffee subscription startup for busy professionals.",
        intent: "propose-generation → a deck brief",
        expectBlocks: ["brief"],
        expectArgs: { briefSurface: "deck" },
        judge: {
            what: "brief",
            rubric: "A tight, specific one-line brief for the coffee-subscription deck — subject + angle + audience (busy professionals) — not a vague restatement.",
        },
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
        intent: "find → propose-generation grounded in the RIGHT deck, as a doc",
        expectTools: ["find-artifacts"],
        expectBlocks: ["brief"],
        expectArgs: { briefSurface: "doc", briefSource: "Series A" },
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
    {
        id: "share",
        category: "guarded",
        surface: "library",
        message: "Share my Series A deck with a colleague.",
        intent: "find → share the RIGHT artifact (routes to the share panel) → action",
        expectTools: ["find-artifacts", "share-artifact"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "share", actionArtifact: "Series A" },
    },
    {
        id: "export",
        category: "guarded",
        surface: "library",
        message: "Export my Series A deck as a PDF.",
        intent: "find → export the RIGHT artifact (routes to the editor) → action",
        expectTools: ["find-artifacts", "export-artifact"],
        expectBlocks: ["action"],
        expectArgs: { actionKind: "export", actionArtifact: "Series A" },
    },
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
    {
        id: "mt-refine-chain",
        category: "multi-turn",
        surface: "editor",
        intent: "a refine sequence on one open artifact: add a section, reformat, restyle — each still routes right",
        turns: [
            {
                message: "Add a section on the market size.",
                expectTools: ["add-section"],
                expectBlocks: ["proposal"],
            },
            {
                message: "Good. Now turn the whole thing into a document.",
                expectTools: ["set-format"],
                expectBlocks: ["proposal"],
            },
            {
                message: "And give it a darker theme.",
                expectTools: ["set-theme"],
                expectBlocks: ["proposal"],
            },
        ],
    },
    {
        id: "mt-read-then-edit",
        category: "multi-turn",
        surface: "library",
        intent: "read an artifact, then edit it using the reference from earlier in the conversation",
        turns: [
            {
                message: "What's my Series A deck about?",
                expectTools: ["find-artifacts", "read-artifact"],
                forbidBlocks: ["proposal", "action"],
            },
            {
                message: "Make its opening punchier.",
                expectTools: ["edit-artifact"],
                expectBlocks: ["proposal"],
                expectArgs: { targetArtifact: "Series A" },
            },
        ],
    },
    {
        id: "mt-ambiguous-clarify",
        category: "multi-turn",
        surface: "library",
        intent: "an ambiguous ask — clarify first (no action), then act once the target is named",
        turns: [
            {
                message: "Can you fix my deck?",
                forbidBlocks: ["proposal", "action", "brief"],
            },
            {
                message: "The Series A one — tighten the opening.",
                expectTools: ["edit-artifact"],
                expectBlocks: ["proposal"],
                expectArgs: { targetArtifact: "Series A" },
            },
        ],
    },
];
