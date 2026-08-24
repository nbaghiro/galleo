import { createEffect, createRoot } from "solid-js";
import { registerBindings, registerCommands, setContext, type KeyCtx } from "@ui/keys";
import { FORMATS } from "@ui/formats";
import {
    duplicateMany,
    getElementAt,
    groupSelection,
    removeMany,
    sharedParent,
    ungroupAt,
} from "@elements/ops";
import { getElement } from "@elements/spec";
import type { ElementAddress, ElementInstance } from "@model/artifact";
import { parentTarget, type Target } from "@model/artifact";
import {
    addSectionAfter,
    canRedo,
    canUndo,
    clearExtras,
    commit,
    duplicateSectionAt,
    editing,
    editor,
    moveSectionBy,
    multiSelected,
    noteElementAdded,
    noteElementRemoved,
    noteElementsGrouped,
    present,
    presenting,
    redo,
    removeSectionAt,
    requestShare,
    selectedAddresses,
    selectMany,
    selection,
    setLeftOpen,
    setRightTab,
    setSelection,
    switchFormat,
    undo,
} from "./store";
import { leaseHolder, say } from "./collab";
import { movable, movableAncestor } from "./dnd";
import { clipboardEl, copyToClipboard, hasClipboard, pasteElements } from "./clipboard";
import { canRegenerate, regenerateElement } from "./ai";
import { captureAnchor, commentableAt, commentsAvailable, startCommentDraft } from "./comments";
import { openSectionPrompt } from "./ai";
import { textSelection, toggleTextMark } from "./text";

// active only when mounted and not presenting (present has its own keymap)
const inEditor = (c: KeyCtx): boolean => c.has("editor") && !c.has("present");
const notTyping = (c: KeyCtx): boolean => !c.has("editor.textEditing");
const editing_ = (c: KeyCtx): boolean => c.has("editor.textEditing");

// The element a comment would hang on: the one being edited, else the selected one, and only when
// it is a block of its own. A part of a composite is not commentable, so the command goes with it.
function commentTarget(): ElementAddress | null {
    const s = selection();
    const at = editing() ?? (s?.kind === "element" ? s.address : null);
    return at && commentableAt(editor.artifact, at) ? at : null;
}

function currentSectionId(): string | null {
    const s = selection();
    if (!s) return null;
    return s.kind === "section" ? s.section : s.address.section;
}

// A closed container's child has no independent existence, so one such member disqualifies the
// whole gesture rather than half of it.
function actionableSet(): ElementAddress[] | null {
    const set = selectedAddresses();
    if (!set.length) return null;
    if (set.some((a) => !movable(editor.artifact, a))) {
        say("This is part of its element; edit it in place");
        return null;
    }
    return set;
}

// Courtesy only: the server never refuses a structural op for lease reasons, so a deletion still
// wins if it happens anyway. This just stops the obvious accident.
function heldByOther(set: ElementAddress[]): boolean {
    for (const a of set) {
        const holder = leaseHolder(a);
        if (holder) {
            say(`${holder.user.name || "Someone"} is editing this`);
            return true;
        }
    }
    return false;
}

const selectedElements = (): ElementInstance[] =>
    selectedAddresses()
        .map((a) => getElementAt(editor.artifact, a))
        .filter((e): e is ElementInstance => e !== undefined);

// The one element-delete and element-duplicate, shared by the keyboard, the context bar, the
// inspector, and the context menu, so gating, collapse, and analytics cannot diverge per surface.
export function deleteSelectedElements(): void {
    const set = actionableSet();
    if (!set || heldByOther(set)) return;
    noteElementRemoved(getElementAt(editor.artifact, set[0]!)?.type ?? "", set.length);
    commit(removeMany(editor.artifact, set));
    setSelection(null);
}

export function duplicateSelectedElements(): void {
    const set = actionableSet();
    if (!set) return;
    const res = duplicateMany(editor.artifact, set);
    commit(res.content);
    selectMany(res.addresses);
}

const canGroup = (): boolean => {
    const set = selectedAddresses();
    return set.length > 1 && !!sharedParent(set) && set.every((a) => movable(editor.artifact, a));
};

function ungroupTarget(): ElementAddress | null {
    const s = selection();
    if (s?.kind !== "element" || multiSelected() || s.address.path.length === 0) return null;
    const inst = getElementAt(editor.artifact, s.address);
    return inst && getElement(inst.type)?.tier === "container" ? s.address : null;
}

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
            if (s.kind !== "element") {
                removeSectionAt(s.section);
                return;
            }
            deleteSelectedElements();
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
            if (s.kind !== "element") {
                duplicateSectionAt(s.section);
                return;
            }
            duplicateSelectedElements();
        },
    },
    {
        id: "edit.copy",
        title: "Copy element",
        group: "edit",
        icon: "duplicate",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        run: () => {
            const els = selectedElements();
            if (els.length) copyToClipboard(els);
        },
    },
    {
        id: "edit.cut",
        title: "Cut element",
        group: "edit",
        icon: "trash",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        run: () => {
            const set = actionableSet();
            const els = selectedElements();
            if (!set || !els.length) return;
            copyToClipboard(els);
            noteElementRemoved(els[0]!.type, set.length);
            commit(removeMany(editor.artifact, set));
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
            const clips = clipboardEl();
            if (!s || !clips.length) return;
            // a paste anchored inside a closed container lands beside the container itself
            const anchor: Target =
                s.kind === "element"
                    ? { kind: "element", address: movableAncestor(editor.artifact, s.address) }
                    : s;
            const res = pasteElements(editor.artifact, clips, anchor);
            if (!res.addresses.length) return;
            commit(res.content);
            for (const clip of clips) noteElementAdded(clip.type, "paste");
            selectMany(res.addresses);
        },
    },
    {
        id: "edit.group",
        title: "Group selection",
        group: "arrange",
        icon: "container",
        when: (c) => inEditor(c) && notTyping(c) && canGroup(),
        run: () => {
            const set = selectedAddresses();
            const res = groupSelection(editor.artifact, set);
            if (!res.address) return;
            commit(res.content);
            noteElementsGrouped(set.length);
            setSelection({ kind: "element", address: res.address });
        },
    },
    {
        id: "edit.ungroup",
        title: "Ungroup",
        group: "arrange",
        icon: "layers",
        when: (c) => inEditor(c) && notTyping(c) && !!ungroupTarget(),
        run: () => {
            const at = ungroupTarget();
            if (!at) return;
            const res = ungroupAt(editor.artifact, at);
            if (!res.addresses.length) return;
            commit(res.content);
            selectMany(res.addresses);
        },
    },

    {
        id: "comment.add",
        title: "Comment on the selection",
        group: "edit",
        icon: "comment",
        when: (c) =>
            inEditor(c) &&
            commentsAvailable() &&
            !multiSelected() &&
            (c.has("editor.element") || c.has("editor.textEditing")) &&
            !!commentTarget(),
        run: () => {
            const address = commentTarget();
            if (!address) return;
            const draft = captureAnchor(address, textSelection());
            if (draft) startCommentDraft(draft);
        },
    },

    {
        id: "select.up",
        title: "Select parent",
        group: "select",
        icon: "chevronUp",
        when: (c) => inEditor(c) && c.has("editor.hasSelection") && notTyping(c),
        run: () => {
            // Esc peels the set back to its anchor before it starts walking up the tree
            if (multiSelected()) {
                clearExtras();
                return;
            }
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
        slash: "/format",
        when: inEditor,
        provider: () =>
            FORMATS.map((f) => ({
                id: `doc.format.${f.value}`,
                title: f.label,
                icon: f.value === "deck" ? "deck" : f.value === "doc" ? "doc" : "site",
                run: () => switchFormat(f.value),
            })),
    },

    {
        id: "present.start",
        title: "Start presenting",
        group: "present",
        icon: "present",
        slash: "/present",
        when: inEditor,
        run: () => present(),
    },
    {
        id: "present.narrate",
        title: "Play with voice",
        group: "present",
        icon: "play",
        slash: "/narrate",
        when: inEditor,
        run: () => present({ withVoice: true }),
    },
    {
        id: "share.open",
        title: "Share…",
        group: "share",
        icon: "shared",
        slash: "/share",
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
    { chord: "mod+g", command: "edit.group", when: "editor" },
    { chord: "mod+shift+g", command: "edit.ungroup", when: "editor" },
    { chord: "mod+c", command: "edit.copy", when: "editor" },
    { chord: "mod+x", command: "edit.cut", when: "editor" },
    { chord: "mod+v", command: "edit.paste", when: "editor" },
    { chord: "mod+b", command: "format.bold", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+i", command: "format.italic", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+u", command: "format.underline", when: "editor.textEditing", allowInInput: true },
    { chord: "mod+alt+m", command: "comment.add", when: "editor", allowInInput: true },
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
