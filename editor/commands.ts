import { createEffect, createRoot } from "solid-js";
import { registerBindings, registerCommands, setContext, type KeyCtx } from "@ui/keys";
import {
    deleteElement,
    duplicateAt,
    duplicatedAddr,
    getElementAt,
    setArtifactFormat,
} from "@elements/ops";
import { parentTarget } from "@model/target";
import {
    addSectionAfter,
    canRedo,
    canUndo,
    commit,
    duplicateSectionAt,
    editing,
    editor,
    moveSectionBy,
    present,
    presenting,
    redo,
    removeSectionAt,
    requestShare,
    selection,
    setLeftOpen,
    setRightTab,
    setSelection,
    undo,
} from "./editor";
import { clipboardEl, copyToClipboard, hasClipboard, pasteElement } from "./clipboard";
import { canRegenerate, regenerateElement } from "./ai/element-gen";
import { openSectionPrompt } from "./ai/section-gen";
import { toggleTextMark } from "./text/text-format";

// active only when mounted and not presenting (present has its own keymap)
const inEditor = (c: KeyCtx): boolean => c.has("editor") && !c.has("present");
const notTyping = (c: KeyCtx): boolean => !c.has("editor.textEditing");
const editing_ = (c: KeyCtx): boolean => c.has("editor.textEditing");

function currentSectionId(): string | null {
    const s = selection();
    if (!s) return null;
    return s.kind === "section" ? s.section : s.address.section;
}

const FORMATS = [
    { id: "deck", label: "Deck" },
    { id: "doc", label: "Document" },
    { id: "web", label: "Website" },
];

registerCommands([
    {
        id: "edit.undo",
        title: "Undo",
        group: "edit",
        icon: "undo",
        when: (c) => inEditor(c) && notTyping(c) && canUndo(),
        run: () => undo(),
    },
    {
        id: "edit.redo",
        title: "Redo",
        group: "edit",
        icon: "redo",
        when: (c) => inEditor(c) && notTyping(c) && canRedo(),
        run: () => redo(),
    },
    {
        id: "edit.delete",
        title: "Delete selection",
        group: "edit",
        icon: "trash",
        dangerous: true,
        when: (c) => inEditor(c) && c.has("editor.hasSelection") && notTyping(c),
        run: () => {
            const s = selection();
            if (!s) return;
            if (s.kind === "element") {
                commit(deleteElement(editor.artifact, s.address));
                setSelection(null);
            } else removeSectionAt(s.section);
        },
    },
    {
        id: "edit.duplicate",
        title: "Duplicate selection",
        group: "edit",
        icon: "duplicate",
        when: (c) => inEditor(c) && c.has("editor.hasSelection") && notTyping(c),
        run: () => {
            const s = selection();
            if (!s) return;
            if (s.kind === "element") {
                commit(duplicateAt(editor.artifact, s.address));
                setSelection({ kind: "element", address: duplicatedAddr(s.address) });
            } else duplicateSectionAt(s.section);
        },
    },
    {
        id: "edit.copy",
        title: "Copy element",
        group: "edit",
        icon: "duplicate",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        run: () => {
            const s = selection();
            if (s?.kind !== "element") return;
            const el = getElementAt(editor.artifact, s.address);
            if (el) copyToClipboard(el);
        },
    },
    {
        id: "edit.cut",
        title: "Cut element",
        group: "edit",
        icon: "trash",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        run: () => {
            const s = selection();
            if (s?.kind !== "element") return;
            const el = getElementAt(editor.artifact, s.address);
            if (!el) return;
            copyToClipboard(el);
            commit(deleteElement(editor.artifact, s.address));
            setSelection(null);
        },
    },
    {
        id: "edit.paste",
        title: "Paste element",
        group: "edit",
        icon: "plus",
        when: (c) => inEditor(c) && c.has("editor.hasSelection") && notTyping(c) && hasClipboard(),
        run: () => {
            const s = selection();
            const clip = clipboardEl();
            if (!s || !clip) return;
            const res = pasteElement(editor.artifact, clip, s);
            if (res) {
                commit(res.content);
                setSelection({ kind: "element", address: res.address });
            }
        },
    },

    {
        id: "select.up",
        title: "Select parent",
        group: "select",
        icon: "chevronUp",
        when: (c) => inEditor(c) && c.has("editor.hasSelection") && notTyping(c),
        run: () => {
            setSelection((cur) => (cur ? parentTarget(cur) : null));
        },
    },

    {
        id: "insert.sectionBelow",
        title: "Add section below",
        group: "insert",
        icon: "plus",
        when: inEditor,
        run: () => addSectionAfter(currentSectionId()),
    },
    {
        id: "insert.sectionViaAi",
        title: "Generate a section with AI…",
        group: "insert",
        icon: "sparkle",
        when: inEditor,
        run: () => openSectionPrompt(currentSectionId()),
    },

    {
        id: "arrange.moveSectionUp",
        title: "Move section up",
        group: "arrange",
        icon: "chevronUp",
        when: (c) => inEditor(c) && c.has("editor.section"),
        run: () => {
            const id = currentSectionId();
            if (id) moveSectionBy(id, -1);
        },
    },
    {
        id: "arrange.moveSectionDown",
        title: "Move section down",
        group: "arrange",
        icon: "chevronDown",
        when: (c) => inEditor(c) && c.has("editor.section"),
        run: () => {
            const id = currentSectionId();
            if (id) moveSectionBy(id, 1);
        },
    },
    {
        id: "arrange.duplicateSection",
        title: "Duplicate section",
        group: "arrange",
        icon: "duplicate",
        when: (c) => inEditor(c) && c.has("editor.section"),
        run: () => {
            const id = currentSectionId();
            if (id) duplicateSectionAt(id);
        },
    },

    {
        id: "format.bold",
        title: "Bold",
        group: "format",
        icon: "bold",
        when: editing_,
        run: () => toggleTextMark("b"),
    },
    {
        id: "format.italic",
        title: "Italic",
        group: "format",
        icon: "italic",
        when: editing_,
        run: () => toggleTextMark("i"),
    },
    {
        id: "format.underline",
        title: "Underline",
        group: "format",
        icon: "underline",
        when: editing_,
        run: () => toggleTextMark("u"),
    },

    {
        id: "view.toggleSections",
        title: "Toggle sections rail",
        group: "view",
        icon: "sections",
        when: inEditor,
        run: () => {
            setLeftOpen((v) => !v);
        },
    },
    {
        id: "view.toggleInspector",
        title: "Toggle inspector",
        group: "view",
        icon: "inspector",
        when: inEditor,
        run: () => {
            setRightTab((t) => (t === "inspector" ? null : "inspector"));
        },
    },

    {
        id: "doc.setFormat",
        title: "Change format…",
        group: "file",
        icon: "layout",
        when: inEditor,
        provider: () =>
            FORMATS.map((f) => ({
                id: `doc.format.${f.id}`,
                title: f.label,
                icon: f.id === "deck" ? "deck" : f.id === "doc" ? "doc" : "site",
                run: () => commit(setArtifactFormat(editor.artifact, f.id)),
            })),
    },

    {
        id: "present.start",
        title: "Start presenting",
        group: "present",
        icon: "present",
        when: inEditor,
        run: () => present(),
    },
    {
        id: "share.open",
        title: "Share…",
        group: "share",
        icon: "shared",
        when: inEditor,
        run: () => requestShare(),
    },

    {
        id: "ai.regenerateElement",
        title: "Regenerate element with AI",
        group: "ai",
        icon: "sparkle",
        when: (c) => {
            const s = selection();
            return inEditor(c) && s?.kind === "element" && canRegenerate(s.address);
        },
        run: () => {
            const s = selection();
            if (s?.kind === "element") void regenerateElement(s.address);
        },
    },
]);

registerBindings([
    { chord: "mod+z", command: "edit.undo", when: "editor" },
    { chord: ["mod+shift+z", "mod+y"], command: "edit.redo", when: "editor" },
    { chord: ["delete", "backspace"], command: "edit.delete", when: "editor" },
    { chord: "mod+d", command: "edit.duplicate", when: "editor" },
    { chord: "escape", command: "select.up", when: "editor" },
    { chord: "mod+c", command: "edit.copy", when: "editor" },
    { chord: "mod+x", command: "edit.cut", when: "editor" },
    { chord: "mod+v", command: "edit.paste", when: "editor" },
    { chord: "mod+b", command: "format.bold", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+i", command: "format.italic", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+u", command: "format.underline", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+shift+enter", command: "present.start", when: "editor" },
]);

// createRoot so the effect has an owner at module scope
createRoot(() => {
    createEffect(() => {
        const s = selection();
        setContext("editor.hasSelection", !!s);
        setContext("editor.element", s?.kind === "element");
        setContext("editor.section", s?.kind === "section");
        setContext("editor.textEditing", !!editing());
        setContext("present", presenting());
    });
});
