import { createEffect, createRoot } from "solid-js";
import { registerBindings, registerCommands, setContext, type KeyCtx } from "@ui/keys";
import { FORMATS } from "@ui/formats";
import {
    duplicableAt,
    duplicateMany,
    elementIdMap,
    getElementAt,
    groupSelection,
    removeMany,
    setElementLayout,
    sharedParent,
    ungroupAt,
} from "@elements/ops";
import { getElement } from "@elements/spec";
import type { Connection, ElementAddress, ElementInstance } from "@model/artifact";
import {
    addressesEqual,
    contentWithElementIds,
    elementRegionId,
    newConnectionId,
    parentTarget,
    type Target,
} from "@model/artifact";
import { capture } from "@ui/analytics";
import {
    addSectionAfter,
    canRedo,
    canUndo,
    clearExtras,
    commit,
    connectFrom,
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
    noteElementMoved,
    selectedAddresses,
    selectMany,
    setConnectFrom,
    setSelectedConnection,
    selection,
    setLeftOpen,
    setRightTab,
    setSelection,
    switchFormat,
    undo,
} from "./store";
import { leaseHolder, say } from "./collab";
import {
    applyDrop,
    groupAxis,
    movable,
    movableAncestor,
    movePayloadFor,
    requestCommitFlip,
    unitItem,
    type DropTarget,
} from "./dnd";
import { pinnable, togglePin } from "./pin";
import { clipboardEl, copyToClipboard, hasClipboard, pasteElements } from "./clipboard";
import { canRegenerate, regenerateElement } from "./ai";

// pinning: the selected element when the inspector could offer the toggle / when it is pinned
const pinTarget = (): ElementAddress | null => {
    const s = selection();
    return s?.kind === "element" && pinnable(editor.artifact, s.address) ? s.address : null;
};
const pinnedTarget = (): ElementAddress | null => {
    const a = pinTarget();
    return a && getElementAt(editor.artifact, a)?.layout?.pin ? a : null;
};
const NUDGES = [
    { id: "nudgeLeft", dx: -1, dy: 0 },
    { id: "nudgeRight", dx: 1, dy: 0 },
    { id: "nudgeUp", dx: 0, dy: -1 },
    { id: "nudgeDown", dx: 0, dy: 1 },
];
// arrows move a pinned element by composed px; a burst of taps folds into one undo step
// The keyboard is micro-drags: each step builds the drag's own DropTarget and lands through
// applyDrop, so the semantics can never diverge from a drop. Along the parent's axis a step
// swaps with the neighbor; at the edge (or across the axis) it steps OUT beside the parent; a
// unit's item swaps inside its unit and never leaves it. `into` (alt) descends instead: the
// adjacent open container takes the element at its near end.
const STEP_AXIS = { up: "col", down: "col", left: "row", right: "row" } as const;
const STEP_FWD = { up: false, down: true, left: false, right: true } as const;
type StepDir = keyof typeof STEP_AXIS;

const openKids = (inst: ElementInstance | undefined): number | null => {
    const c = inst && getElement(inst.type)?.container;
    return c && !c.closed ? c.children(inst.data).length : null;
};

function arrangeStep(dir: StepDir, into: boolean): void {
    const s = selection();
    if (s?.kind !== "element") return;
    const art = editor.artifact;
    const { payload } = movePayloadFor(art, s.address, selectedAddresses());
    if (payload.kind !== "move" && payload.kind !== "moveMany") return;
    const section = s.address.section;
    const indices = payload.kind === "moveMany" ? [...payload.indices].sort((a, b) => a - b) : null;
    const anchorPath =
        payload.kind === "move" ? payload.from.path : [...payload.parent.path, indices![0]!];
    if (anchorPath.length === 0) return; // a whole root moves with its section
    const parentPath = anchorPath.slice(0, -1);
    const parent = getElementAt(art, { section, path: parentPath });
    const axis = groupAxis(parent);
    const dirAxis = STEP_AXIS[dir];
    const fwd = STEP_FWD[dir];
    const sealed = payload.kind === "move" && unitItem(art, payload.from) !== null;
    const kidCount = openKids(parent) ?? 0;
    const lo = indices ? indices[0]! : anchorPath.at(-1)!;
    const hi = indices ? indices[indices.length - 1]! : anchorPath.at(-1)!;
    let target: DropTarget | null = null;
    if (into) {
        if (dirAxis !== axis || sealed) return;
        const nIdx = fwd ? hi + 1 : lo - 1;
        const sib = getElementAt(art, { section, path: [...parentPath, nIdx] });
        if (!sib) return;
        const end = openKids(sib);
        if (end === null || getElement(sib.type)?.tier !== "container") {
            // a leaf or sealed neighbor wraps instead: joined perpendicular, payload leading
            target = {
                section,
                op: "wrap",
                path: [...parentPath, nIdx],
                index: 0,
                before: true,
                direction: axis === "row" ? "col" : "row",
            };
        } else
            target = {
                section,
                op: "insert",
                path: [...parentPath, nIdx],
                index: fwd ? 0 : end,
                before: false,
                direction: groupAxis(sib),
            };
    } else if (dirAxis === axis) {
        if (!fwd && lo > 0)
            target = {
                section,
                op: "insert",
                path: parentPath,
                index: lo - 1,
                before: false,
                direction: axis,
            };
        else if (fwd && hi < kidCount - 1)
            target = {
                section,
                op: "insert",
                path: parentPath,
                index: hi + 2,
                before: false,
                direction: axis,
            };
        else if (!sealed && parentPath.length > 0) {
            const gpPath = parentPath.slice(0, -1);
            const gp = getElementAt(art, { section, path: gpPath });
            target = {
                section,
                op: "insert",
                path: gpPath,
                index: parentPath.at(-1)! + (fwd ? 1 : 0),
                before: false,
                direction: groupAxis(gp),
            };
        }
    } else if (!sealed) {
        if (parentPath.length === 0) {
            target = { section, op: "wrap", path: [], index: 0, before: !fwd, direction: dirAxis };
        } else {
            const gpPath = parentPath.slice(0, -1);
            const gp = getElementAt(art, { section, path: gpPath });
            target =
                groupAxis(gp) === dirAxis
                    ? {
                          section,
                          op: "insert",
                          path: gpPath,
                          index: parentPath.at(-1)! + (fwd ? 1 : 0),
                          before: false,
                          direction: dirAxis,
                      }
                    : {
                          section,
                          op: "wrap",
                          path: parentPath,
                          index: 0,
                          before: !fwd,
                          direction: dirAxis,
                      };
        }
    }
    if (!target) return;
    const before = art;
    const moved = getElementAt(before, { section, path: anchorPath });
    const res = applyDrop(before, target, payload);
    if (res.content === before || !res.address) return;
    requestCommitFlip();
    commit(res.content, { coalesce: `arrange:${moved?.id ?? section}` });
    if (indices) {
        const head = res.address.path.at(-1) ?? 0;
        selectMany(
            target.op === "insert"
                ? indices.map((_, i) => ({
                      section: res.address!.section,
                      path: [...res.address!.path.slice(0, -1), head + i],
                  }))
                : indices.map((_, i) => ({
                      section: res.address!.section,
                      path: [...res.address!.path, i],
                  })),
        );
    } else setSelection({ kind: "element", address: res.address });
    if (moved) noteElementMoved(moved.type, res.address.section === section, "keys");
}

const flowStep = (c: KeyCtx): boolean =>
    inEditor(c) && notTyping(c) && c.has("editor.hasSelection") && !pinnedTarget();

const ARRANGE_STEPS = (["up", "down", "left", "right"] as StepDir[]).flatMap((dir) => [
    {
        id: `arrange.step${dir[0]!.toUpperCase()}${dir.slice(1)}`,
        title: `Move ${dir}`,
        group: "arrange" as const,
        when: flowStep,
        run: () => arrangeStep(dir, false),
    },
    {
        id: `arrange.into${dir[0]!.toUpperCase()}${dir.slice(1)}`,
        title: `Move into the container ${dir === "up" ? "above" : dir === "down" ? "below" : `to the ${dir}`}`,
        group: "arrange" as const,
        when: flowStep,
        run: () => arrangeStep(dir, true),
    },
]);

function nudgePin(dx: number, dy: number): void {
    const a = pinnedTarget();
    if (!a) return;
    const inst = getElementAt(editor.artifact, a)!;
    const pin = inst.layout!.pin!;
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    commit(
        setElementLayout(editor.artifact, a, {
            ...inst.layout,
            pin: { ...pin, dx: r1((pin.dx ?? 0) + dx), dy: r1((pin.dy ?? 0) + dy) },
        }),
        { coalesce: `pin:${elementRegionId(a)}:nudge` },
    );
}
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
// Both reach every element: a sealed container's child is removed or copied the way its container
// says (see `deleteElement`), so only the drag-out seal stays with `movable`.
export function deleteSelectedElements(): void {
    const set = selectedAddresses();
    if (!set.length || heldByOther(set)) return;
    noteElementRemoved(getElementAt(editor.artifact, set[0]!)?.type ?? "", set.length);
    commit(removeMany(editor.artifact, set));
    setSelection(null);
}

export function duplicateSelectedElements(): void {
    const set = selectedAddresses().filter((a) => duplicableAt(editor.artifact, a));
    if (!set.length) {
        say("This is part of its element and has no copy of its own");
        return;
    }
    const res = duplicateMany(editor.artifact, set);
    commit(res.content);
    if (res.addresses.length) selectMany(res.addresses);
}

// The connect gesture: armed from the selection, completed by the next canvas press. Ends are
// stored by stable element id, so the ids are stamped before anything points at them.
export function startConnect(): void {
    const s = selection();
    if (s?.kind !== "element") return;
    setConnectFrom(movableAncestor(editor.artifact, s.address));
}

export function completeConnect(to: { address: ElementAddress; datum?: number }): boolean {
    const from = connectFrom();
    setConnectFrom(null);
    if (!from) return false;
    const target = movableAncestor(editor.artifact, to.address);
    if (addressesEqual(from, target)) return false;
    const content = contentWithElementIds(editor.artifact);
    const fromEl = getElementAt(content, from);
    const toEl = getElementAt(content, target);
    if (!fromEl?.id || !toEl?.id) return false;
    const connection: Connection = {
        id: newConnectionId(),
        from: { element: fromEl.id },
        to: { element: toEl.id, ...(to.datum !== undefined ? { datum: to.datum } : {}) },
    };
    commit({ ...content, connections: [...(content.connections ?? []), connection] });
    setSelectedConnection(connection.id);
    capture("connection_created", {
        from_type: fromEl.type,
        to_type: toEl.type,
        to_datum: to.datum !== undefined,
        cross_section: from.section !== target.section,
    });
    return true;
}

const connectionSections = (c: Connection): boolean => {
    const addrs = elementIdMap(editor.artifact);
    const a = addrs.get(c.from.element)?.section;
    const b = addrs.get(c.to.element)?.section;
    return !!a && !!b && a !== b;
};

export function removeConnection(id: string): void {
    const list = editor.artifact.connections ?? [];
    const gone = list.find((c) => c.id === id);
    if (!gone) return;
    const kept = list.filter((c) => c.id !== id);
    const { connections: _connections, ...rest } = editor.artifact;
    commit(kept.length ? { ...editor.artifact, connections: kept } : rest);
    setSelectedConnection(null);
    capture("connection_deleted", { cross_section: connectionSections(gone) });
}

export function setConnectionStyle(id: string, patch: NonNullable<Connection["style"]>): void {
    const list = editor.artifact.connections ?? [];
    if (!list.some((c) => c.id === id)) return;
    commit({
        ...editor.artifact,
        connections: list.map((c) => (c.id === id ? { ...c, style: { ...c.style, ...patch } } : c)),
    });
}

// A palette CLICK inserts where a paste would: beside the selection (outside a seal), into the
// selected section, else at the end of the last section. Drag keeps choosing its own slot.
export function insertFromPalette(inst: ElementInstance): boolean {
    const s = selection();
    const anchor: Target | null =
        s?.kind === "element"
            ? { kind: "element", address: movableAncestor(editor.artifact, s.address) }
            : (s ?? sectionEnd());
    if (!anchor) return false;
    const res = pasteElements(editor.artifact, [inst], anchor);
    if (!res.addresses.length) return false;
    commit(res.content);
    noteElementAdded(inst.type, "palette");
    selectMany(res.addresses);
    return true;
}

const sectionEnd = (): Target | null => {
    const last = editor.artifact.sections.at(-1);
    return last ? { kind: "section", section: last.id } : null;
};

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
        id: "insert.connect",
        title: "Draw connection",
        group: "insert",
        icon: "arrowUpRight",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        run: () => startConnect(),
    },
    {
        id: "edit.cut",
        title: "Cut element",
        group: "edit",
        icon: "trash",
        when: (c) => inEditor(c) && c.has("editor.element") && notTyping(c),
        // literally copy + the child-aware delete, so cut reaches everything copy does
        run: () => {
            const els = selectedElements();
            if (!els.length) return;
            copyToClipboard(els);
            deleteSelectedElements();
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
        id: "pin.toggle",
        title: "Pin in place",
        group: "arrange",
        icon: "pin",
        keywords: ["pin", "unpin", "anchor", "float"],
        when: (c) => inEditor(c) && notTyping(c) && !!pinTarget(),
        run: () => {
            const a = pinTarget();
            if (a) togglePin(a, "palette");
        },
    },
    ...NUDGES.flatMap(({ id, dx, dy }) =>
        [1, 10].map((step) => ({
            id: step === 1 ? `pin.${id}` : `pin.${id}Fast`,
            title: `Nudge ${id}`,
            group: "arrange" as const,
            palette: false,
            when: (c: KeyCtx) => inEditor(c) && notTyping(c) && !!pinnedTarget(),
            run: () => nudgePin(dx * step, dy * step),
        })),
    ),

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

    ...ARRANGE_STEPS,
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
    { chord: "left", command: "arrange.stepLeft", when: "editor" },
    { chord: "right", command: "arrange.stepRight", when: "editor" },
    { chord: "up", command: "arrange.stepUp", when: "editor" },
    { chord: "down", command: "arrange.stepDown", when: "editor" },
    { chord: "alt+left", command: "arrange.intoLeft", when: "editor" },
    { chord: "alt+right", command: "arrange.intoRight", when: "editor" },
    { chord: "alt+up", command: "arrange.intoUp", when: "editor" },
    { chord: "alt+down", command: "arrange.intoDown", when: "editor" },
    { chord: "left", command: "pin.nudgeLeft", when: "editor" },
    { chord: "right", command: "pin.nudgeRight", when: "editor" },
    { chord: "up", command: "pin.nudgeUp", when: "editor" },
    { chord: "down", command: "pin.nudgeDown", when: "editor" },
    { chord: "shift+left", command: "pin.nudgeLeftFast", when: "editor" },
    { chord: "shift+right", command: "pin.nudgeRightFast", when: "editor" },
    { chord: "shift+up", command: "pin.nudgeUpFast", when: "editor" },
    { chord: "shift+down", command: "pin.nudgeDownFast", when: "editor" },
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
