import type { ElementAddress } from "@model/target";
import type { ArtifactContent, ElementLayout } from "@model/artifact";
import { createSignal } from "solid-js";
import { getElementAt, setElementLayout, setSectionWidths, updateDataAt } from "@elements/ops";

// A live, uncommitted direct-manipulation edit (resize / column-drag / spacing) driven by a canvas
// handle. The canvas paints `applyLiveEdit(artifact, edit)` while a handle is dragged so the layout
// reflows in real time; the same op is committed on release. One signal covers every handle kind.
export type LiveEdit =
    | {
          kind: "element";
          address: ElementAddress;
          layoutPatch?: Partial<ElementLayout>; // width / cross-axis (ElementLayout)
          dataPatch?: Record<string, unknown>; // height / aspect / gap / padding (element data)
      }
    | { kind: "columns"; section: string; widths: number[] };

export const [liveEdit, setLiveEdit] = createSignal<LiveEdit | null>(null);

export function applyLiveEdit(art: ArtifactContent, edit: LiveEdit): ArtifactContent {
    if (edit.kind === "columns") return setSectionWidths(art, edit.section, edit.widths);
    const inst = getElementAt(art, edit.address);
    if (!inst) return art;
    let out = art;
    if (edit.layoutPatch)
        out = setElementLayout(out, edit.address, { ...(inst.layout ?? {}), ...edit.layoutPatch });
    if (edit.dataPatch)
        out = updateDataAt(out, edit.address, {
            ...(inst.data as Record<string, unknown>),
            ...edit.dataPatch,
        });
    return out;
}
