export interface DocArticle {
    slug: string;
    group: string;
    title: string;
    description: string;
    steps: string[];
    sections: { id: string; heading: string; body: string }[];
}

export const DOC_ARTICLES: DocArticle[] = [
    {
        slug: "getting-started",
        group: "Start here",
        title: "Your first piece",
        description: "Create a useful first draft, edit it, and share the result.",
        steps: [
            "Choose a template or describe the result you need.",
            "Replace example content and review the generated material.",
            "Preview the output and choose Share or Export.",
        ],
        sections: [
            {
                id: "section-1",
                heading: "Choose a starting point",
                body: "Sign in to Galleo and open Templates to start with an existing structure, or start a new AI generation from your library. Choose a deck, document, or website for the job at hand. A template contains example material: replace its names, figures, and claims before sharing.",
            },
            {
                id: "section-2",
                heading: "Make it yours",
                body: "Open the piece in the editor. Select text to change the copy, select an element to adjust its controls, and use the section rail to move through longer work. Give the piece a recognizable title so you can find it in your library.",
            },
            {
                id: "section-3",
                heading: "Review and deliver",
                body: "Check facts, links, media rights, and the layout in your chosen format. Use Present for a slideshow, Share for a hosted link, or Export for a file. Open a shared link in a signed-out browser to check the audience experience.",
            },
        ],
    },
    {
        slug: "formats",
        group: "Start here",
        title: "One piece, three formats",
        description: "Understand how decks, visual documents, and websites share the same content.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Content and format",
                body: "A piece is made of sections containing text, media, charts, diagrams, and other elements. The format controls how those sections are laid out. Switching formats reuses the content; it does not create an independent copy of the piece.",
            },
            {
                id: "section-2",
                heading: "Choose for your audience",
                body: "Use a deck when you will guide an audience through a sequence. Use a document when readers need to move through detail at their own pace. Use a website for a continuous page that people open in a browser. The same content can need different amounts of detail in each context.",
            },
            {
                id: "section-3",
                heading: "Check the new layout",
                body: "Open the format control in the editor or use Change format in the command palette. After switching, review long headings, dense tables, and media. A section can occupy more than one slide when content needs more space. Duplicate the piece first if you want separately maintained versions.",
            },
        ],
    },
    {
        slug: "templates",
        group: "Create",
        title: "Work with templates",
        description: "Find a starting structure and turn it into your own content.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Browse and preview",
                body: "Open Templates and use the available categories and format choices to narrow the library. Preview a template before choosing it. The preview lets you inspect the structure and see how the content works in different formats.",
            },
            {
                id: "section-2",
                heading: "Replace the examples",
                body: "After creating a piece from a template, replace the title, text, charts, figures, and media that do not belong to your project. Templates demonstrate layout; their business names and results are not evidence for your own claims.",
            },
            {
                id: "section-3",
                heading: "Reuse your own work",
                body: "Keep a finished piece as a starting point for similar work. Duplicate it before adapting it for a different audience, then rename the copy and review any inherited links or figures. Changing a theme can give reused content a different visual treatment.",
            },
        ],
    },
    {
        slug: "ai-creation",
        group: "Create",
        title: "Create and edit with AI",
        description: "Give the assistant a clear brief and review the work as it develops.",
        steps: [
            "State the audience and purpose.",
            "Add the facts and source material the result must use.",
            "Review the structure, then refine specific sections.",
        ],
        sections: [
            {
                id: "section-1",
                heading: "Write a useful brief",
                body: "Describe the audience, purpose, output format, and what the reader should do next. Include the facts that must appear and the constraints that matter, such as tone or length. A useful brief is specific: “A sales deck for operations leaders, covering these three problems and our pilot proposal” is easier to act on than “make a good presentation.”",
            },
            {
                id: "section-2",
                heading: "Supply context and direction",
                body: "Use the generation workflow to attach relevant context and choose the design direction. Review the outline and content as they appear. Ask for targeted changes such as shortening an introduction, adding a comparison, or replacing an unsupported claim with a question to research.",
            },
            {
                id: "section-3",
                heading: "Review the result",
                body: "AI can invent details and misunderstand source material. Check names, dates, calculations, citations, and image relevance before publishing. Generated content remains editable through the same editor controls as content you wrote yourself. AI actions may consume credits; available models and tools depend on the workspace plan.",
            },
        ],
    },
    {
        slug: "assistant-context",
        group: "Create",
        title: "The assistant and source context",
        description: "Use conversation and reference material to guide work across your workspace.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Ask for a concrete change",
                body: "Open the assistant and say what you want to accomplish. Name the piece or selection and describe the change in observable terms: shorten the introduction, add a comparison table, or turn a set of notes into a structured draft. Review the changes in the piece after the assistant acts.",
            },
            {
                id: "section-2",
                heading: "Attach useful context",
                body: "Add relevant reference files or source material in the creation workflow. Keep sources focused on the task and distinguish confirmed facts from suggestions. If the source is stale or contradictory, resolve that before treating the generated result as authoritative.",
            },
            {
                id: "section-3",
                heading: "Control what leaves the workspace",
                body: "AI work sends relevant inputs to the model provider handling the task. Share only material you are authorized to provide, and review the Privacy Policy before using confidential or regulated information. Ask the assistant to identify uncertainty rather than invent missing evidence.",
            },
        ],
    },
    {
        slug: "editor",
        group: "Edit and design",
        title: "Use the editor",
        description: "Navigate sections, select elements, and make precise changes.",
        steps: [
            "Select the section you want to change.",
            "Select text, an element, or its parent container.",
            "Change the content or controls, then inspect the surrounding layout.",
        ],
        sections: [
            {
                id: "section-1",
                heading: "Navigate the canvas",
                body: "The section rail gives you an overview of the piece. Select a section to move to it, or scroll the canvas. The editor arranges content through containers, so changing a piece of content can move nearby elements to keep the layout coherent.",
            },
            {
                id: "section-2",
                heading: "Select the right thing",
                body: "Select an element to reveal the controls that apply to it. Edit text directly, use element controls for styling and data, and select a parent container when you want to change how a group is arranged. Undo and Redo apply to editing actions; use them promptly when an experiment does not work.",
            },
            {
                id: "section-3",
                heading: "Work on a smaller screen",
                body: "On a phone, editor controls move into a bottom bar and sheets to leave room for the canvas. Open the relevant sheet to insert or inspect content, then return to the canvas to check the result. A larger screen gives more room for dense layouts, but changing device size does not change the underlying content.",
            },
        ],
    },
    {
        slug: "sections-layout",
        group: "Edit and design",
        title: "Sections and layout",
        description: "Organize a piece into readable groups and control their arrangement.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Give each section a job",
                body: "Use one section for one idea, such as the problem, evidence, comparison, or next step. Add, duplicate, reorder, or remove sections to change the narrative. A duplicated section is useful when several parts of a piece should share a structure.",
            },
            {
                id: "section-2",
                heading: "Arrange groups of elements",
                body: "Containers group elements into rows and columns. Their alignment, spacing, and sizing determine how the children fit together. Change the container when the whole group needs to move or reflow; change an individual element when only that item needs adjustment.",
            },
            {
                id: "section-3",
                heading: "Avoid crowding",
                body: "Long copy and dense data need space. Split an overloaded section, shorten repeated labels, or use a document format when detail matters more than a slide-sized summary. Preview the piece at the size your audience will use rather than judging it only from a miniature.",
            },
        ],
    },
    {
        slug: "themes",
        group: "Edit and design",
        title: "Themes and visual style",
        description: "Use a coordinated theme, then adjust individual elements where needed.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Apply a theme",
                body: "Choose a theme for the piece to change its typography, colors, borders, corners, and visual treatment together. Review both image-heavy and text-heavy sections after switching. The theme is a set of coordinated choices, so you do not need to recolor every item manually.",
            },
            {
                id: "section-2",
                heading: "Customize with intent",
                body: "Use the theme editor to adjust a custom theme when the workspace allows it. Keep enough contrast for body text and chart labels, choose fonts that work at your output size, and test long headings. Element-level overrides are useful for emphasis but can make a piece less consistent if used everywhere.",
            },
            {
                id: "section-3",
                heading: "Theme versus content",
                body: "Changing a theme changes presentation, not the facts in your piece. A dark image background may require different text contrast from a light section. Review exported files as well as the editor because your audience may be using a different screen or printing the result.",
            },
        ],
    },
    {
        slug: "media",
        group: "Edit and design",
        title: "Images, video, and files",
        description: "Find, upload, generate, and place media that supports the content.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Choose the source",
                body: "Open the media picker from an image or video element. Depending on the action, you can use workspace media, upload a file, search stock sources, or generate media with AI. Pick a source that suits the result and check the rights attached to material you did not create.",
            },
            {
                id: "section-2",
                heading: "Fit the visual to the layout",
                body: "Use the element controls to adjust how the image fits its frame and which part is visible. A wide photo and a portrait frame can crop important details; check faces, labels, and screenshots at the final size. Add descriptive alternative text where the element provides it.",
            },
            {
                id: "section-3",
                heading: "Review playback and credits",
                body: "Video and interactive media behave differently from static exports. Test them in the published viewer and use a still image or explanation where a PDF cannot play the content. Stock attribution can travel with exports; do not remove required credits or assume an AI result is free of third-party rights.",
            },
        ],
    },
    {
        slug: "charts-diagrams",
        group: "Edit and design",
        title: "Charts, tables, and diagrams",
        description: "Explain data and relationships with editable visual elements.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Choose the right element",
                body: "Use a table for exact values, a chart for a comparison or trend, and a diagram for a process or relationship. Insert the element, then open its data or configuration controls. Start with the message you want the audience to understand rather than choosing the most decorative shape.",
            },
            {
                id: "section-2",
                heading: "Enter and check data",
                body: "Replace sample values and labels with your own. Keep units, periods, and categories consistent. Inspect legends, axes, totals, and labels after editing: a visually plausible chart can still communicate the wrong comparison if the source data is wrong.",
            },
            {
                id: "section-3",
                heading: "Keep it readable",
                body: "Use fewer categories on a slide and move supporting detail into a document or another section. Diagrams need clear labels and a visible reading direction. Preview at the audience size and check the exported result, especially for dense tables and small labels.",
            },
        ],
    },
    {
        slug: "sharing",
        group: "Share and deliver",
        title: "Sharing and publishing",
        description: "Choose who can access a piece and what they can do.",
        steps: [
            "Open Share and choose the intended audience.",
            "Check link visibility and collaborator permissions.",
            "Test the link outside your signed-in editor session.",
        ],
        sections: [
            {
                id: "section-1",
                heading: "Choose the audience",
                body: "Open Share on the piece. Public links can be viewed by anyone who has them. Protected and private options add access controls where your workspace plan permits them. Review the actual settings before sending a link; an unlisted address is not the same thing as access restricted to named people.",
            },
            {
                id: "section-2",
                heading: "Separate viewing from editing",
                body: "A published viewing link is different from an invitation to collaborate. Invite collaborators with the permission they need: view, comment, or edit. Workspace defaults can affect access, so inspect the piece’s sharing settings rather than assuming every member or guest has the same rights.",
            },
            {
                id: "section-3",
                heading: "Test and maintain links",
                body: "Open the link as the intended audience, including in a signed-out browser when appropriate. Published links show the current draft, so subsequent edits can change what readers see. Duplicate the piece if you need a separately maintained version for an audience. Remove or restrict a link when its audience should no longer have access. Links also stop serving a piece when it is in Trash or the owning workspace no longer has public-link access under its plan.",
            },
        ],
    },
    {
        slug: "collaboration",
        group: "Share and deliver",
        title: "Collaborators and comments",
        description:
            "Review work together without losing the distinction between feedback and edits.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Invite with the right permission",
                body: "Use sharing controls to invite people to a piece. Give edit access to people who should change the content and comment access to reviewers. A guest’s access to one piece does not automatically grant access to the rest of the workspace.",
            },
            {
                id: "section-2",
                heading: "Work together",
                body: "Presence and cursors help you see who is in the editor. When somebody is actively editing an element, the editor coordinates that edit so people do not type over each other in the same place. Communicate about larger structural changes when several people are working on one piece.",
            },
            {
                id: "section-3",
                heading: "Keep feedback attached",
                body: "Add a comment to the relevant selection or text rather than describing its location in a separate message. Reply in the thread and resolve it when the feedback is handled. If the referenced content is removed or substantially changed, review the thread’s location before acting on old feedback.",
            },
        ],
    },
    {
        slug: "present-export",
        group: "Share and deliver",
        title: "Present and export",
        description: "Deliver the same piece as a presentation, document, or downloadable file.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Present from Galleo",
                body: "Open Present to move through the piece as a slideshow. Review slide order and notes before the session. Dense sections can produce multiple slides, so check the actual presentation sequence rather than assuming one section always equals one slide.",
            },
            {
                id: "section-2",
                heading: "Choose an export destination",
                body: "The export dialog offers PDF, PowerPoint, Google Slides, images, and print according to your plan. PDF is useful for a fixed document; PowerPoint keeps supported text editable; image export produces section images. Google Slides sends a rendered presentation to your connected Google account, so do not assume it has the same editability as PowerPoint.",
            },
            {
                id: "section-3",
                heading: "Check the final file",
                body: "Wait for export preparation to finish, then open the actual file in the destination viewer. Inspect fonts, line breaks, charts, image crops, and attribution. Audio, video, forms, and other interactive behavior cannot be assumed to survive in a static PDF or image.",
            },
        ],
    },
    {
        slug: "narration",
        group: "Share and deliver",
        title: "Voice and narration",
        description: "Prepare spoken content and review it alongside your slides.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Start with the script",
                body: "Speaker notes and visible section copy serve different purposes. Write or generate narration that explains the slide without reading every label aloud. Review the script for pronunciation, numbers, and claims before preparing audio.",
            },
            {
                id: "section-2",
                heading: "Choose and prepare a voice",
                body: "Use the available voice controls to select a voice and prepare narration. Voice and audio actions depend on workspace entitlements and may use credits. Only use a voice you have permission to use; do not impersonate a person without authorization.",
            },
            {
                id: "section-3",
                heading: "Review after editing",
                body: "Play the result and check pacing against the sections. If you change the script or content, review whether the prepared audio needs to be regenerated. Test narration and any music bed in the intended playback surface rather than assuming a downloaded static file includes them.",
            },
        ],
    },
    {
        slug: "forms-analytics",
        group: "Share and deliver",
        title: "Forms and audience activity",
        description: "Collect responses and understand how people use your published links.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Build a form",
                body: "Insert form elements into the piece and configure their labels and fields. Ask only for information you need and explain why you need it. A form in the editor is a layout preview; test actual submission through the published viewer.",
            },
            {
                id: "section-2",
                heading: "Review responses",
                body: "Open the piece’s Share controls and use the Responses tab to review submitted information. Treat responses as customer data and restrict editing or sharing access appropriately. A static PDF or exported image cannot submit a form.",
            },
            {
                id: "section-3",
                heading: "Review link activity",
                body: "Open Shared to see the pieces you have shared and their links. Audience analytics, where included in your plan, can help you understand views and engagement. These measurements are not a list of identified readers and should not be treated as proof that a specific person read every section.",
            },
        ],
    },
    {
        slug: "library-search",
        group: "Manage your workspace",
        title: "Library, folders, and search",
        description: "Keep pieces organized and find work without remembering its exact title.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Organize in the library",
                body: "Your library belongs to the selected workspace. Use folders to group related work and rename pieces so their purpose is clear. Duplicate a piece for a separate version. Check which workspace is selected before concluding that an item has disappeared.",
            },
            {
                id: "section-2",
                heading: "Find a piece or action",
                body: "Use library search to find accessible content. The command palette, opened with Command+K on Mac or Control+K on other systems, combines navigation and actions. Results respect what your account can access; a search does not grant permission to another person’s work.",
            },
            {
                id: "section-3",
                heading: "Trash and recovery",
                body: "Moving a piece to Trash removes it from the normal library without immediately deleting it permanently. Open Trash to restore it or permanently remove it. Check shared links and keep any required export before permanent deletion.",
            },
        ],
    },
    {
        slug: "workspaces-billing",
        group: "Manage your workspace",
        title: "Workspaces, plans, and credits",
        description:
            "Understand what belongs to a workspace and how paid actions are accounted for.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Choose the workspace",
                body: "Workspace membership, content, sharing policies, plan, and credit balance are related. Switch to the correct workspace before creating work or changing settings. Account settings are about you; workspace settings control the team and its resources.",
            },
            {
                id: "section-2",
                heading: "Manage members and settings",
                body: "Use workspace settings to review members and roles. An owner or administrator can manage settings according to their permissions. Before inviting someone, check the plan’s member allowance and the default access your workspace gives members.",
            },
            {
                id: "section-3",
                heading: "Understand credits and subscriptions",
                body: "AI work can use credits, while a subscription determines which capabilities the workspace can use. Review the current plan, balance, and credit activity in the billing surfaces. Costs differ by action and model. Changing a plan does not mean every AI action is unlimited; use the in-product plan details as the current source for prices and allowances.",
            },
        ],
    },
    {
        slug: "connected-apps",
        group: "Manage your workspace",
        title: "Connected apps and MCP",
        description: "Let a compatible AI client work with Galleo under permissions you choose.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Connect through authorization",
                body: "For a client that supports remote MCP, use https://galleo.app/mcp as the server address and complete the browser authorization flow. Client setup screens vary. Sign in to Galleo, review the requested access, and choose the workspaces the connection should be allowed to reach.",
            },
            {
                id: "section-2",
                heading: "Keep permissions narrow",
                body: "A connection can read or change only what its grants and your workspace access allow. Start with the access needed for the task. Actions performed through a connected client can modify real content and consume workspace credits just like actions initiated in Galleo.",
            },
            {
                id: "section-3",
                heading: "Review and disconnect",
                body: "Review connected apps in your account settings and revoke access when a connection is no longer needed. If a tool is refused, check the selected workspace, granted scope, your role, and the workspace plan before reconnecting. Never paste a password or private access token into a document to make a connection work.",
            },
        ],
    },
    {
        slug: "account",
        group: "Manage your workspace",
        title: "Your account and sign-in",
        description: "Manage your identity separately from your workspace membership.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Profile and security",
                body: "Open Account to review your profile and security options. Keep your email current and use the sign-in method associated with your account. If you use password sign-in and cannot remember the password, use the reset flow rather than creating a second account with a different address.",
            },
            {
                id: "section-2",
                heading: "Confirm your email",
                body: "Complete email confirmation when prompted. Check spam and confirm the address was entered correctly if a message does not arrive. A confirmation code or password-reset link is a credential: do not share it with another person.",
            },
            {
                id: "section-3",
                heading: "Membership and connections",
                body: "Use Account to review your workspaces and connected apps. Leaving a workspace and deleting an account are different actions; neither should be assumed to remove content belonging to other workspace members. Consult the Privacy Policy for account-data requests.",
            },
        ],
    },
    {
        slug: "privacy-security",
        group: "Reference",
        title: "Privacy and access controls",
        description:
            "Understand the controls around your work and where to find the legal policies.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Before you share",
                body: "Check both collaborator permissions and published-link settings. Make sure protected links require the intended access and public links contain only material you intend to disclose. A recipient can retain a copy of something they were permitted to see.",
            },
            {
                id: "section-2",
                heading: "AI and external services",
                body: "Generating content can send prompts, piece content, and attached context to the provider handling that action. Media search, narration, payments, and connected apps have their own data flows. Read the Privacy Policy for the provider list and data-handling details before entering sensitive information.",
            },
            {
                id: "section-3",
                heading: "Policies and account questions",
                body: "The Privacy Policy explains data handling and the Terms of Service govern use of Galleo. This guide describes product controls and does not replace those policies. Use the contact details in the policies for privacy or account requests; do not post credentials or private content in a public link when asking for help.",
            },
        ],
    },
    {
        slug: "troubleshooting",
        group: "Reference",
        title: "Troubleshooting",
        description: "Check the most common causes of access, generation, and delivery problems.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "A piece is missing or access is refused",
                body: "Check the signed-in account and selected workspace first. Look in Trash and confirm the invitation or sharing permission is still valid. A link can stop working after it is removed, restricted, or the underlying piece is deleted. Ask the owner to review access rather than repeatedly creating accounts.",
            },
            {
                id: "section-2",
                heading: "Generation or media did not finish",
                body: "Check your connection, workspace credits, and whether the requested feature is included in the plan. Review any error shown by the app. If the provider is temporarily unavailable, retry after checking whether a partial result already exists so you do not create unnecessary duplicates.",
            },
            {
                id: "section-3",
                heading: "The output looks different",
                body: "Check the selected format and theme, allow fonts and media to finish loading, and inspect the piece in the actual destination. Shorten crowded copy or split dense sections. If a static export is missing playback or interaction, share the hosted viewer when the audience needs those behaviors.",
            },
        ],
    },
    {
        slug: "keyboard",
        group: "Reference",
        title: "Keyboard and navigation",
        description: "Find actions and move through work without hunting through every control.",
        steps: [],
        sections: [
            {
                id: "section-1",
                heading: "Open the command palette",
                body: "Press Command+K on Mac or Control+K on other systems. Search for a piece or an action, then choose a result. Available actions depend on the current surface and your permissions. The palette is a useful way to discover editor actions such as Change format or Start presenting.",
            },
            {
                id: "section-2",
                heading: "Edit with familiar controls",
                body: "Use Undo, Redo, Copy, Cut, and Paste in the context of the current selection. When you are editing text, the selection belongs to the text editor; when an element is selected, element actions apply. Check which item is selected before deleting or duplicating.",
            },
            {
                id: "section-3",
                heading: "Use a phone or keyboard",
                body: "Controls adapt to smaller screens through sheets and compact navigation. Use Tab to move among interactive controls and Enter or Space to activate focused controls where appropriate. For a crowded view, close a panel or use the command palette to find the next action.",
            },
        ],
    },
];

export function docFor(pathname: string): DocArticle | undefined {
    return DOC_ARTICLES.find((article) => `/docs/${article.slug}` === pathname.replace(/\/$/, ""));
}

export function searchDocs(query: string): DocArticle[] {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return DOC_ARTICLES.filter((article) => {
        const text = [
            article.title,
            article.description,
            article.group,
            ...article.steps,
            ...article.sections.flatMap((section) => [section.heading, section.body]),
        ]
            .join(" ")
            .toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
    });
}
