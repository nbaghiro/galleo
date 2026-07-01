import type {
    ArtifactContent,
    Cell,
    ElementInstance,
    Section,
    SectionBackground,
} from "@model/content";

// A Patch is the unit of change an agent turn produces — an ordered list of structural ops on an
// ArtifactContent. Generate streams `addSection`s; regenerate-a-section is one `replaceSection`; edit-a-
// block is one `replaceElement`. The same model powers streaming (apply ops as they arrive), surgical
// edits, history, and undo (every op has a structural inverse). Pure: no IO, no engine.

export type PatchOp =
    | { op: "setMeta"; theme?: string; format?: string; background?: SectionBackground | null }
    | { op: "addSection"; afterId?: string | null; section: Section } // afterId null/absent ⇒ append
    | { op: "replaceSection"; id: string; section: Section }
    | { op: "removeSection"; id: string }
    | { op: "moveSection"; id: string; afterId: string | null } // null ⇒ move to front
    | { op: "replaceElement"; sectionId: string; cell: string; element: ElementInstance | null } // null ⇒ clear
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

export type Patch = PatchOp[];

const cloneSections = (sections: Section[]): Section[] =>
    sections.map((s) => ({ ...s, cells: { ...s.cells } }));

function insertAfter(
    sections: Section[],
    afterId: string | null | undefined,
    section: Section,
): Section[] {
    const without = sections.filter((s) => s.id !== section.id); // re-add (move) is allowed
    if (afterId == null) return afterId === null ? [section, ...without] : [...without, section];
    const idx = without.findIndex((s) => s.id === afterId);
    if (idx < 0) return [...without, section]; // unknown anchor ⇒ append
    return [...without.slice(0, idx + 1), section, ...without.slice(idx + 1)];
}

function applyOp(content: ArtifactContent, op: PatchOp): ArtifactContent {
    switch (op.op) {
        case "setMeta": {
            const next = { ...content };
            if (op.theme !== undefined) next.theme = op.theme;
            if (op.format !== undefined) next.format = op.format;
            if (op.background !== undefined) next.background = op.background ?? undefined;
            return next;
        }
        case "addSection":
            return { ...content, sections: insertAfter(content.sections, op.afterId, op.section) };
        case "replaceSection":
            return {
                ...content,
                sections: content.sections.map((s) => (s.id === op.id ? op.section : s)),
            };
        case "removeSection":
            return { ...content, sections: content.sections.filter((s) => s.id !== op.id) };
        case "moveSection": {
            const target = content.sections.find((s) => s.id === op.id);
            if (!target) return content;
            return { ...content, sections: insertAfter(content.sections, op.afterId, target) };
        }
        case "replaceElement":
            return {
                ...content,
                sections: content.sections.map((s) => {
                    if (s.id !== op.sectionId) return s;
                    const cells: Record<string, Cell> = { ...s.cells };
                    cells[op.cell] = op.element ? { element: op.element } : {};
                    return { ...s, cells };
                }),
            };
        case "setSectionBackground":
            return {
                ...content,
                sections: content.sections.map((s) =>
                    s.id === op.sectionId ? { ...s, background: op.background ?? undefined } : s,
                ),
            };
    }
}

// Apply a patch immutably — returns a new ArtifactContent, never mutates the input.
export function applyPatch(content: ArtifactContent, patch: Patch): ArtifactContent {
    let next: ArtifactContent = { ...content, sections: cloneSections(content.sections) };
    for (const op of patch) next = applyOp(next, op);
    return next;
}
