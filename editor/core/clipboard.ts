import type { ArtifactContent, ElementInstance, ElementAddress, Target } from "@model/artifact";
import { withFreshElementIds } from "@model/artifact";
import { createSignal } from "solid-js";
import { getElementAt, isContainer, stripWidth } from "@elements/ops";
import { getElement } from "@elements/spec";
import { place, type DropTarget } from "./dnd";

// the whole selection, so a multi copy pastes back as the block it was cut from
const [clipboardEl, setClipboardEl] = createSignal<ElementInstance[]>([]);
export { clipboardEl };

export function copyToClipboard(els: ElementInstance[]): void {
    setClipboardEl(els.map((el) => structuredClone(el)));
}
export function hasClipboard(): boolean {
    return clipboardEl().length > 0;
}

function childCountOf(inst: ElementInstance): number {
    const c = getElement(inst.type)?.container;
    return c ? c.children(inst.data).length : 0;
}

function pasteTarget(art: ArtifactContent, target: Target): DropTarget | null {
    const section = target.kind === "element" ? target.address.section : target.section;
    const path = target.kind === "element" ? target.address.path : [];

    // child element → insert as the next sibling
    if (path.length >= 1)
        return {
            section,
            op: "insert",
            path: path.slice(0, -1),
            index: path[path.length - 1]! + 1,
            before: false,
            direction: "col",
        };

    // section root: append if it's a container, else wrap the leaf
    const root = getElementAt(art, { section, path: [] });
    if (!root) return null;
    return isContainer(root)
        ? {
              section,
              op: "insert",
              path: [],
              index: childCountOf(root),
              before: false,
              direction: "col",
          }
        : { section, op: "wrap", path: [], index: 0, before: false, direction: "col" };
}

// Width-stripped so it adopts the new container's sizing (a stale column % would overflow the row),
// and re-identified: a paste is a new node, even when the source is still in the document.
export function pasteElement(
    art: ArtifactContent,
    clip: ElementInstance,
    target: Target,
): { content: ArtifactContent; address: ElementAddress } | null {
    const dt = pasteTarget(art, target);
    if (!dt) return null;
    const placed = place(art, dt, withFreshElementIds(stripWidth(structuredClone(clip))));
    return placed.address ? { content: placed.content, address: placed.address } : null;
}

/** Each element anchors on the one before it, so a block pastes back in its original order. */
export function pasteElements(
    art: ArtifactContent,
    clips: ElementInstance[],
    target: Target,
): { content: ArtifactContent; addresses: ElementAddress[] } {
    let content = art;
    let anchor = target;
    const addresses: ElementAddress[] = [];
    for (const clip of clips) {
        const res = pasteElement(content, clip, anchor);
        if (!res) break;
        content = res.content;
        addresses.push(res.address);
        anchor = { kind: "element", address: res.address };
    }
    return { content, addresses };
}
