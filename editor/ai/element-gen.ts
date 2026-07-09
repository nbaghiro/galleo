import type { ArtifactContent } from "@model/artifact";
import type { ElementAddress } from "@model/target";
import { createStore } from "solid-js/store";
import { getElementAt, setElementAt } from "@elements/ops";
import { commit, content, editor, getReviseElement, setSelection } from "../editor";

// Regenerate-an-element flow — the ContextBar's Regenerate action. One call swaps the selected element for a
// fresh AI version, in place, as a single undoable step. It "handles both cases": a self-contained element
// regenerates itself; a fragment of a tightly-coupled container (a line inside a quote / stat / bullets)
// regenerates the whole parent, since that piece only means something together. The app injects the transport
// (onReviseElement); no host → the action stays hidden.

// A child of one of these is a fragment of a single composed unit — regenerate the whole parent, not the
// piece on its own (rewriting just the attribution of a quote, or one bullet row, makes no sense alone).
const COUPLED = new Set(["quote", "stat", "bullets"]);
// Purely structural / user-owned — nothing for the model to regenerate, so no affordance.
const INERT = new Set(["divider", "video"]);

// Resolve what a Regenerate click on `addr` should actually target — the element itself, or its nearest
// meaningful ancestor. Returns null when there's nothing sensible to regenerate (e.g. a divider).
export function regenTarget(art: ArtifactContent, addr: ElementAddress): ElementAddress | null {
    let a = addr;
    // climb out of any tightly-coupled parent (a child of quote / stat / bullets → the parent is the unit)
    for (;;) {
        if (a.path.length === 0) break;
        const parentAddr: ElementAddress = { ...a, path: a.path.slice(0, -1) };
        const parent = getElementAt(art, parentAddr);
        if (parent && COUPLED.has(parent.type)) {
            a = parentAddr;
            continue;
        }
        break;
    }
    const inst = getElementAt(art, a);
    if (!inst || INERT.has(inst.type)) return null;
    return a;
}

// Whether a Regenerate affordance should show for a selected element — a transport must be wired (i.e. the
// studio is running inside the app) and the selection must resolve to a real regeneration target.
export function canRegenerate(addr: ElementAddress): boolean {
    return getReviseElement() !== null && regenTarget(editor.artifact, addr) !== null;
}

interface ElementGenState {
    addr: ElementAddress | null; // the element being regenerated (null → idle)
    status: "working" | "error" | null;
    error: string | null;
}

const [elementGen, setElementGen] = createStore<ElementGenState>({
    addr: null,
    status: null,
    error: null,
});
export { elementGen };

export const elementGenBusy = (): boolean => elementGen.status === "working";

let errTimer = 0;

// Regenerate the element at `addr` (resolved to its real target) and swap the fresh version in as one undo
// step. `instruction` steers it; omit for a straight re-roll. Guards against landing onto a tree the user
// changed mid-flight (edit / undo) by re-checking the target still exists before committing.
export async function regenerateElement(addr: ElementAddress, instruction?: string): Promise<void> {
    const reviser = getReviseElement();
    if (!reviser || elementGenBusy()) return;
    const base = content();
    const target = regenTarget(base, addr);
    if (!target) return;
    const current = getElementAt(base, target);
    if (!current) return;

    window.clearTimeout(errTimer);
    setElementGen({ addr: target, status: "working", error: null });
    setSelection({ kind: "element", address: target });

    try {
        const next = await reviser(base, target.section, current, instruction);
        if (getElementAt(content(), target)) {
            commit(setElementAt(content(), target, next));
            setSelection({ kind: "element", address: target });
        }
        setElementGen({ addr: null, status: null, error: null });
    } catch (e) {
        setElementGen({
            addr: target,
            status: "error",
            error: e instanceof Error ? e.message : "couldn't regenerate that",
        });
        errTimer = window.setTimeout(
            () => setElementGen({ addr: null, status: null, error: null }),
            2600,
        );
    }
}
