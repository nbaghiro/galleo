import type { GenerateInput, SectionInput, Surface } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section, SectionForm } from "@model/artifact";
import { BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "@services/core/ai/schema";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, layoutCatalog, presetList, siteAnatomy } from "./catalog";
import { RUBRIC, VOICE, lengthGuidance } from "./rubric";
import { arcGuidance } from "./arcs";
import {
    OUTPUT_NOTE,
    SECTION_OUTPUT,
    SECTION_RULES,
    artifactSpine,
    briefContext,
    heading,
    insertionContext,
    neighbors,
    retrievedContext,
    stack,
    writtenContext,
} from "./system";
import { sectionExemplars, siteExemplar } from "./exemplars";
import type { PromptParts } from "./system";

const OUTLINE_JOB = `## Your job
Plan the artifact: your reading of the brief, a title, a backdrop, and an ordered list of beats (sections). Before anything else, commit to one concrete world and stay in it: a named subject (a company, a person, a place, an occasion), where it is, and two or three real, odd numbers that belong to it (a price, a date, a count). Weave that commitment into the \`backdrop\` and the beats' briefs, because every section is written against them and sections that invent their own facts drift apart. Then state what you take the piece to be, its \`goal\` (what it has to achieve), \`audience\` (who it's for), and \`tone\` (how it should sound), inferred from the prompt and any source material; these are shown to the user and every section is written against them, so make them specific rather than generic. The backdrop is the artifact's full-bleed background image, describe a moody, on-theme atmospheric scene that evokes the subject (a wide, low-detail environment, since it sits behind every section under a scrim). Never a generic abstract texture. The outline is a skeleton other calls flesh out, so keep every field tight: phrases and single sentences, never paragraphs; the section writer gets the whole outline and expands it. Give the piece a real narrative arc that fits the topic, the beat roles (scene, tension, turn, proof, objection, momentum, close) are a toolbox to draw on, not a fixed sequence: use the ones the story needs, in the order it needs, and repeat proof/momentum beats where the argument earns them. An \`objection\` beat answers the reader's strongest doubt plainly (seasonality, price, "why not more or faster"), and one done honestly is often the most convincing section in the piece. For each beat: a short url-safe id (\`s1\`, \`s2\`, … is fine, and on a website a word naming what the section holds, since that id is what a nav link points at), a short working label, its narrative role, the layout you intend (\`layout\`, a named preset: ${presetList()}), and, crucially, design its LAYOUT: assign a block to each column, in order (\`blocks\`, one per column, each one of: ${BLOCK_KINDS.join(", ")}). Vary layouts and blocks across the piece, and place visual blocks (image / stat / chart / diagram / table) where they earn their spot rather than defaulting to walls of text, the layout you choose is rendered as a live skeleton and the section writer must fill it exactly. When a beat's points are parallel voices rather than a sequence (three menus, three seasons, three levels), plan a \`tabs\` section for it instead of bullets. Also give each beat whether it leads with an image. Then WRITE THE STORY, not a table of contents, for every beat give all three of: \`brief\` (one line naming the section's job), \`takeaway\` (a full sentence stating the one thing the reader leaves with), and \`points\` (the 2–4 concrete moves it makes, in order, the actual claims, numbers, comparisons, or steps. Never topic labels like "benefits" or "overview"). Decide the real substance here: what each section actually argues, and with what. A section written from "Traction" is generic; one written from "1,900 studios joined in five months, four in five still active at week eight, and the curve steepened after the referral launch" is not. Make consecutive beats build on each other rather than restating the same idea. Give the opening (scene) and closing (close) sections a full-bleed background image, set image=true for them; they anchor the piece. Don't pad and don't truncate.`;

// one clip for both readers of the source, so the planner and the writers see the same window
const SOURCE_CLIP = 6000;

const clipSource = (s: string): string =>
    s.length > SOURCE_CLIP ? `${s.slice(0, SOURCE_CLIP)}…` : s;

function sourceMaterial(source?: string): string | undefined {
    const s = source?.trim();
    if (!s) return undefined;
    return heading(
        "Source material, build the piece FROM this",
        `Ground the outline in this material: use its real facts, structure, and specifics, don't invent competing ones. Distill and reorganize it into a strong narrative that fits this format.\n\n${clipSource(s)}`,
    );
}

// the section writer's view of the same material: quote it, don't re-distill it
function sourceForSection(source?: string): string | undefined {
    const s = source?.trim();
    if (!s) return undefined;
    return heading(
        "Source material, the piece is built from this",
        `Where this section's points touch the material, use its REAL facts: the exact numbers, names, dates, and phrasing. Ground every claim you can in it, and never invent a fact that competes with it.\n\n${clipSource(s)}`,
    );
}

export interface OutlineOpts {
    maxSections?: number;
    pack?: string;
    /** The starter whose shapes this run borrows, if the reader picked one. */
    forms?: readonly SectionForm[];
    shapeName?: string;
}

export function outlineParts(input: GenerateInput, opts: OutlineOpts = {}): PromptParts {
    const { maxSections, pack, forms, shapeName } = opts;
    return {
        // static fragments first and the surface- and theme-specific ones last, so the provider's
        // prompt cache keeps the shared prefix across runs that differ only in those
        system: stack(
            ["persona", PERSONA],
            ["job", OUTLINE_JOB],
            ["layouts", layoutCatalog()],
            ["rubric", RUBRIC],
            ["surface voice", surfaceVoice(input.surface)],
            input.surface === "web" && ["site anatomy", siteAnatomy()],
            ["theme", describeTheme(input.theme)],
            ["output", OUTPUT_NOTE],
        ),
        prompt: stack(
            briefContext(input),
            sourceMaterial(input.source),
            retrievedContext(pack),
            shapeToFollow(forms, shapeName),
            lengthGuidance(input.length),
            maxSections
                ? `Hard limit: plan at MOST ${maxSections} sections, anything beyond is discarded.`
                : "",
            input.mustInclude?.length
                ? `Every "Must cover" point in the brief gets a home: for each beat, set \`covers\` to the point(s) it covers, copied VERBATIM from the list. Every point appears in at least one beat's \`covers\`; leave \`covers\` off beats that cover none. Echo that same list back as \`mustInclude\`.`
                : `Name the 2–5 points this piece must cover for the brief to be satisfied (\`mustInclude\`), then give each one a home: set each beat's \`covers\` to the point(s) it covers, copied VERBATIM from your own list. Every point appears in at least one beat's \`covers\`; leave \`covers\` off beats that cover none.`,
            arcGuidance(input),
            "Produce the outline now.",
        ),
    };
}

/** A design id back as words, so the planner reads "1_Timeline Chart" as a timeline. */
const readable = (id: string): string =>
    id
        .replace(/[-_]+/g, " ")
        .replace(/\b\d+\b/g, "")
        .replace(/\s+/g, " ")
        .trim() || id;

/**
 * The designs a picked starter lends this run. A real template is a labelled library ("Quote",
 * "Timeline", "VS Slide") rather than a running order, so the planner picks one design per beat and
 * the piece's length stays its own. Only the form travels, never a word of the library's copy.
 *
 * The last line is the honest cost of the promise: a stat-heavy design applied to a brief with no
 * numbers would otherwise be answered with invented ones, since the voice rules ask for figures.
 */
function shapeToFollow(forms: readonly SectionForm[] | undefined, name?: string): string {
    if (!forms?.length) return "";
    const catalog = forms
        .map(
            (f) =>
                ` - \`${f.id}\` (${readable(f.id)}) · ${f.layout} · ${f.blocks.join(" | ")}${f.image ? " · full-bleed image" : ""}`,
        )
        .join("\n");
    return heading(
        "The designs to use",
        `The reader picked ${name ? `“${name}”` : "a starter"} as the design library for this piece. These are the designs it offers, as a set to choose from rather than an order to follow:\n${catalog}\nSet each beat's \`design\` to the id of the one that suits what the beat has to do: a pulled quote takes the quote design, a set of parallel points takes a column design, figures take a table or chart design, an opening takes the cover or a section divider. Reuse a design wherever the piece repeats that kind of moment, skip the ones this piece has no use for, and leave \`design\` off a beat only when nothing in the library fits. Plan the number of beats the story needs, which has nothing to do with how many designs are listed here. Write your own story into these designs, never the library's subject and never its facts.\nWhere a design asks for a number, a chart or a table and the brief gives you nothing real to put there, lead that column with text instead rather than inventing data.`,
    );
}

function columnPlan(beat: Beat): string {
    return (beat.blocks ?? []).map((b, i) => `column ${i + 1}: ${b}`).join(", ");
}

function blockLine(beat: Beat): string | undefined {
    if (!beat.blocks?.length) return undefined;
    return `Fill the columns in this exact order, leading each with its assigned block, ${columnPlan(beat)}. A "text" column = a headline + supporting copy; "image" = one image; "stat" = a stat; "bullets" = a short list; "chart"/"diagram"/"table" = that visual; "quote" = a pulled quote; "cards" = a small group of cards. The live preview shows this layout, so match it exactly (don't move a block to a different column).`;
}

function placement(beat: Beat, outline: Outline): string {
    const idx = outline.beats.findIndex((b) => b.id === beat.id);
    // ids, not just labels: a nav link or a hero CTA has to name a real section of this same piece
    const arc = outline.beats
        .map(
            (b, i) => `${i + 1}. [${b.id}] ${b.label}${b.id === beat.id ? "  ← writing this" : ""}`,
        )
        .join("\n");
    return heading(
        "This section",
        [
            `Artifact title: ${outline.title}`,
            `Beat ${idx + 1} of ${outline.beats.length}: "${beat.label}" (role: ${beat.role})`,
            beat.brief && `What it must say: ${beat.brief}`,
            beat.takeaway && `The one thing the reader must leave with: ${beat.takeaway}`,
            beat.points?.length &&
                `Make these moves, in this order. This is the section's substance, so write them out properly rather than gesturing at them:\n${beat.points
                    .map((p, i) => `  ${i + 1}. ${p}`)
                    .join("\n")}`,
            beat.layout &&
                `Use EXACTLY this layout, the plan chose it and a live preview is already showing it: ${beat.layout}.`,
            blockLine(beat),
            beat.image ? "This section leads with a prominent image." : undefined,
            idx === 0
                ? "This is the COVER, give it a full-bleed background image and keep the overlay to the title plus a one-line subtitle."
                : undefined,
            idx === outline.beats.length - 1
                ? "This is the CLOSING section, a full-bleed background image behind a short closing line and a call to action reads beautifully."
                : undefined,
            "",
            "The full arc, for continuity:",
            arc,
        ]
            .filter((x) => x !== undefined)
            .join("\n"),
    );
}

// The same order rule as the outline: everything every section call shares comes first, then
// what depends on the surface, then the theme line, with the output envelope last where it lands.
function sectionSystem(surface: Surface, theme: string): string {
    return stack(
        ["persona", PERSONA],
        ["elements", elementCatalog()],
        ["layouts", layoutCatalog()],
        ["rules", SECTION_RULES],
        ["voice", VOICE],
        ["surface voice", surfaceVoice(surface)],
        surface === "web" && ["site anatomy", siteAnatomy()],
        ["exemplars", sectionExemplars(surface)],
        surface === "web" && ["site exemplar", siteExemplar()],
        ["theme", describeTheme(theme)],
        ["output", SECTION_OUTPUT],
    );
}

// steer = a session-wide note applying to every section from here on; note = this attempt only;
// content = the artifact as built so far (hand-edits included), for continuity + anti-repetition
interface SectionExtras {
    steer?: string;
    note?: string;
    content?: ArtifactContent;
    pack?: string; // retrieved context, already queried for THIS beat
}

export function sectionParts(
    input: GenerateInput,
    beat: Beat,
    outline: Outline,
    extras: SectionExtras = {},
): PromptParts {
    return {
        system: sectionSystem(input.surface, input.theme),
        prompt: stack(
            briefContext(input),
            sourceForSection(input.source),
            retrievedContext(extras.pack),
            // the beat being written never lists itself: on a regeneration the content still
            // carries the old take, and "already written" must not anchor the fresh one
            writtenContext(extras.content, beat.id),
            placement(beat, outline),
            extras.steer?.trim() &&
                heading("Steering note from the reader, follow it", extras.steer.trim()),
            extras.note?.trim() &&
                heading(
                    "What to change versus the previous attempt",
                    `${extras.note.trim()}\nThis is a fresh take on the same beat, keep the beat's job and layout, change the content to satisfy the note.`,
                ),
            `Write section "${beat.id}" now, real, specific, finished content.`,
        ),
    };
}

// A section that parsed but failed the checks is repaired rather than rewritten from nothing: the
// writer is shown its own object and what is wrong with it, under the fragments a repair needs
// (the contract and the rules), not the exemplars and layouts a fresh write is taught with.
export function repairParts(
    surface: Surface,
    prompt: string,
    previous: string,
    issues: readonly string[],
): PromptParts {
    return {
        system: stack(
            ["persona", PERSONA],
            ["elements", elementCatalog()],
            ["rules", SECTION_RULES],
            surface === "web" && ["site anatomy", siteAnatomy()],
            ["output", SECTION_OUTPUT],
        ),
        prompt: stack(
            prompt,
            heading("Your previous section", previous),
            heading(
                "What is wrong with it",
                `${issues.map((i) => `- ${i}`).join("\n")}\nReturn the corrected section as ONE JSON object: keep its id, its layout and every cell that was fine, fix only what is listed, and fill any cell that was empty with a real element.`,
            ),
        ),
    };
}

export function surfaceOf(format: string): Surface {
    return format === "doc" || format === "web" ? format : "deck";
}

const PLAN_ONE_JOB = `## Your job
Plan ONE new section to slot into this artifact at the marked spot. Decide its narrative role, choose the layout that fits (\`layout\`, a named preset: ${presetList()}), and design its LAYOUT: assign a block to each column, in order (\`blocks\`, one per column, each one of: ${BLOCK_KINDS.join(", ")}). Reach for a visual block (image / stat / chart / diagram / table) where the idea is a picture, number, trend, or process rather than defaulting to a wall of text. Give it a short working label, whether it leads with an image, and a one-line brief of what it must say. Match the density and voice of the sections around it. This section has to feel like it was always there.`;

export function sectionPlanParts(input: SectionInput): PromptParts {
    const surface = surfaceOf(input.content.format);
    return {
        system: stack(
            PERSONA,
            surfaceVoice(surface),
            describeTheme(input.content.theme),
            layoutCatalog(),
            surface === "web" && siteAnatomy(),
            PLAN_ONE_JOB,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            artifactSpine(input.content),
            insertionContext(input.content, input.afterId),
            heading("What the reader asked this section to be", input.instruction),
            "Plan the one section now.",
        ),
    };
}

function insertPlacement(beat: Beat, input: SectionInput): string {
    return stack(
        heading(
            "This section",
            [
                `Role: ${beat.role}. Working title: "${beat.label}".`,
                beat.brief && `What it must say: ${beat.brief}`,
                beat.takeaway && `The reader must leave with: ${beat.takeaway}`,
                beat.points?.length &&
                    `Make these moves, in order:\n${beat.points.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}`,
                beat.layout &&
                    `Use EXACTLY this layout, a live preview is already showing it: ${beat.layout}.`,
                blockLine(beat),
                beat.image ? "This section leads with a prominent image." : undefined,
            ]
                .filter((x): x is string => typeof x === "string")
                .join("\n"),
        ),
        insertionContext(input.content, input.afterId),
    );
}

export function insertSectionParts(input: SectionInput, beat: Beat): PromptParts {
    const surface = surfaceOf(input.content.format);
    return {
        system: sectionSystem(surface, input.content.theme),
        prompt: stack(
            heading("The brief", `This one section: ${input.instruction}`),
            insertPlacement(beat, input),
            `Write section "${beat.id}" now, real, specific, finished content.`,
        ),
    };
}

export function editSectionParts(
    content: ArtifactContent,
    section: Section,
    instruction: string,
): PromptParts {
    return {
        system: sectionSystem(surfaceOf(content.format), content.theme),
        prompt: stack(
            heading("What to change", instruction),
            neighbors(content, section.id),
            heading("The section as it is now", "```json\n" + JSON.stringify(section) + "\n```"),
            `Rewrite section "${section.id}" to satisfy the instruction, keep its id (and its layout, unless the change requires a different one), and return the full revised section as JSON. Its \`frame\`, \`background\`, \`bleed\` and any docked row (\`layout.dock\`, the site's topbar) come back unchanged unless the instruction is about them; a rewrite that quietly drops the topbar takes the whole site's navigation with it.`,
        ),
    };
}

// every string a re-layout must carry through unchanged: copy plus the images already placed
export function sectionCopyInventory(section: Section): { text: string[]; images: string[] } {
    const text: string[] = [];
    const images: string[] = [];
    const walk = (el: ElementInstance): void => {
        const d = el.data as Record<string, unknown>;
        if (typeof d.text === "string" && d.text.trim()) text.push(d.text);
        if (typeof d.items === "string" && d.items.trim()) text.push(d.items);
        if (typeof d.src === "string" && d.src.trim()) images.push(d.src);
        if (Array.isArray(d.children)) for (const c of d.children as ElementInstance[]) walk(c);
    };
    walk(section.root);
    return { text, images };
}

export function relayoutSectionParts(
    content: ArtifactContent,
    section: Section,
    brief: string,
    direction?: string,
): PromptParts {
    const inv = sectionCopyInventory(section);
    return {
        system: sectionSystem(surfaceOf(content.format), content.theme),
        prompt: stack(
            heading(
                "What to do",
                "Re-lay-out this section: keep WHAT it says, change HOW it is arranged. This is a layout pass, not a rewrite. Carry the section's own `frame`, `background` and `bleed` through unchanged, and if it holds a docked row (`layout.dock`), that row is site chrome: return it as it came, still the first child of the root and still docked.",
            ),
            heading(
                "Arrangement direction",
                direction?.trim() ? `${brief}\nThe user adds: ${direction.trim()}` : brief,
            ),
            neighbors(content, section.id),
            heading("The section as it is now", "```json\n" + JSON.stringify(section) + "\n```"),
            heading(
                "Copy inventory: reuse verbatim",
                inv.text.map((t) => `- ${JSON.stringify(t)}`).join("\n") +
                    (inv.images.length
                        ? `\n\nImages you may use (no new ones):\n${inv.images.map((s) => `- ${s}`).join("\n")}`
                        : "\n\nThis section has no images; do not add any."),
            ),
            `Return the full section as JSON with id "${section.id}". Every string in the copy inventory appears verbatim in your output: regroup, reorder or re-emphasize them across different elements, but never reword, trim, or invent copy.`,
        ),
    };
}

const ELEMENT_OUTPUT = `## Output, return ONE JSON object and nothing else
No prose, no explanation, no markdown fences. A single element in this exact shape:
{ "type": "<the SAME type as the original element>", "data": { /* the fields the catalog lists for that type */ } }
Keep "type" identical to the original. You are rewriting its CONTENT, not changing what kind of element it is. If it's a container (group / card / quote / stat / bullets / callout), return it with its \`data.children\` fully populated. Every string is real, finished copy. Never placeholder text.`;

function elementSystem(surface: Surface, theme: string): string {
    return stack(
        PERSONA,
        surfaceVoice(surface),
        describeTheme(theme),
        elementCatalog(),
        SECTION_RULES,
        VOICE,
        ELEMENT_OUTPUT,
    );
}

function elementContext(content: ArtifactContent, section: Section): string {
    return stack(
        artifactSpine(content),
        heading(
            "The section it belongs to",
            `Fit this section's point and the piece's voice; don't duplicate copy that another element in the section already carries.\n\`\`\`json\n${JSON.stringify(section)}\n\`\`\``,
        ),
    );
}

export function reviseElementParts(
    content: ArtifactContent,
    section: Section,
    element: ElementInstance,
    instruction?: string,
): PromptParts {
    const change = instruction?.trim()
        ? heading("What to change", instruction.trim())
        : heading(
              "What to do",
              "Regenerate this element, a fresh, stronger version that makes the same kind of point in a better way. Keep it the same TYPE, but genuinely rework the wording, numbers, or framing so it reads as a real alternative, not the same text handed back.",
          );
    return {
        system: elementSystem(surfaceOf(content.format), content.theme),
        prompt: stack(
            change,
            elementContext(content, section),
            heading("The element as it is now", "```json\n" + JSON.stringify(element) + "\n```"),
            `Return the single revised element as JSON, same "type", fresh content.`,
        ),
    };
}
