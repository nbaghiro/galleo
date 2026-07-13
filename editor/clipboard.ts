import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { ElementAddress, Target } from "@model/target";
import { createSignal } from "solid-js";
import { getElementAt, isContainer, stripWidth } from "@elements/ops";
import { getElement } from "@elements/spec";
import { place, type DropTarget } from "./canvas/dnd";

const [clipboardEl, setClipboardEl] = createSignal<ElementInstance | null>(null);
export { clipboardEl };

export function copyToClipboard(el: ElementInstance): void {
    setClipboardEl(structuredClone(el));
}
export function hasClipboard(): boolean {
    return clipboardEl() !== null;
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

// width-stripped so it adopts the new container's sizing (a stale column % would overflow the row)
export function pasteElement(
    art: ArtifactContent,
    clip: ElementInstance,
    target: Target,
): { content: ArtifactContent; address: ElementAddress } | null {
    const dt = pasteTarget(art, target);
    if (!dt) return null;
    const placed = place(art, dt, stripWidth(structuredClone(clip)));
    return placed.address ? { content: placed.content, address: placed.address } : null;
}
