import type { ArtifactContent } from "@model/artifact";
import type { ElementAddress } from "@model/target";
import { createStore } from "solid-js/store";
import { getElementAt, setElementAt } from "@elements/ops";
import {
    commit,
    content,
    editing,
    editor,
    getReviseElement,
    setSelection,
    stopEditing,
} from "../editor";

const isAtOrUnder = (path: number[], ancestor: number[]): boolean =>
    ancestor.every((v, i) => path[i] === v);

// child of these = a fragment of one composed unit → regenerate the whole parent, not the piece alone
const COUPLED = new Set(["quote", "stat", "bullets"]);
// nothing to regenerate → no affordance
const INERT = new Set(["divider", "video"]);

export function regenTarget(art: ArtifactContent, addr: ElementAddress): ElementAddress | null {
    let a = addr;
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

export function canRegenerate(addr: ElementAddress): boolean {
    return getReviseElement() !== null && regenTarget(editor.artifact, addr) !== null;
}

interface ElementGenState {
    addr: ElementAddress | null;
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

// re-check the target still exists before committing — the user may have edited/undone mid-flight
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
            // stop editing before commit: the browser won't repaint an in-place change to a live contenteditable
            const ed = editing();
            if (ed && ed.section === target.section && isAtOrUnder(ed.path, target.path))
                stopEditing();
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
