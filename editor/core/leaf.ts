import type { TextLeaf } from "@engine/node";
import type { ElementAddress } from "@model/artifact";
import { composedLeafFor, sectionContentTokens } from "@elements/compose";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { profileFor } from "@engine/profile";
import { ctxFor } from "@canvas/render/commands";
import { sectionLayoutWidth } from "@canvas/render/backends";
import { canvasContentWidth, editor, editorTokens } from "./store";

// The text leaf for an address exactly as the canvas painted it, for chrome that must match the
// screen (the inline editor's overlay, the bar's color swatch). Composed at the painted width and
// profile — the type ramp makes font size a function of width, so any other width is wrong. The
// composed leaf carries container restyling and the section's contrast swap; the spec's own leaf
// covers a bare element.
export function paintedLeafFor(address: ElementAddress): TextLeaf | null {
    const inst = getElementAt(editor.artifact, address);
    const spec = inst ? getElement(inst.type) : undefined;
    if (!inst || !spec) return null;
    const base = editorTokens();
    const section = editor.artifact.sections.find((s) => s.id === address.section);
    const profile = profileFor(editor.artifact);
    const w = section
        ? sectionLayoutWidth(section, profile, canvasContentWidth())
        : canvasContentWidth();
    const composed = section ? composedLeafFor(section, address, ctxFor(w, base, profile)) : null;
    const tokens = section ? sectionContentTokens(section, base) : base;
    return composed ?? spec.layout(inst.data, ctxFor(w, tokens, profile)).text ?? null;
}
