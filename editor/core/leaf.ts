import type { EngineNode, TextLeaf } from "@engine/node";
import type { ElementAddress, Section } from "@model/artifact";
import type { LayoutCtx } from "@elements/spec";
import { composedLeafFor, composedNodeFor, sectionContentTokens } from "@elements/compose";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { profileFor } from "@engine/profile";
import { ctxFor } from "@canvas/render/commands";
import { sectionLayoutWidth } from "@canvas/render/backends";
import { canvasContentWidth, editor, editorTokens, sectionFitScale } from "./store";

// The compose context the canvas painted with — the type ramp makes font size a function of
// width, so chrome that must match the screen composes at exactly this width and profile. Autofit
// is the second factor on the same type: a fitted section paints smaller than it is authored, and
// an overlay composed without it would show the caret's line at the wrong size.
function paintedCtx(section: Section | undefined): LayoutCtx {
    const profile = profileFor(editor.artifact);
    const w = section
        ? sectionLayoutWidth(section, profile, canvasContentWidth())
        : canvasContentWidth();
    const ctx = ctxFor(w, editorTokens(), profile);
    return section ? { ...ctx, fitScale: sectionFitScale(section.id) } : ctx;
}

// the engine subtree for an address as painted (ramp, restyling, contrast swap included)
export function paintedNodeFor(address: ElementAddress): EngineNode | null {
    const section = editor.artifact.sections.find((s) => s.id === address.section);
    return section ? composedNodeFor(section, address, paintedCtx(section)) : null;
}

// The text leaf for an address as painted, for chrome that must match the screen (the inline
// editor's overlay, the bar's color swatch). The composed leaf carries container restyling and
// the section's contrast swap; the spec's own leaf covers a bare element.
export function paintedLeafFor(address: ElementAddress): TextLeaf | null {
    const inst = getElementAt(editor.artifact, address);
    const spec = inst ? getElement(inst.type) : undefined;
    if (!inst || !spec) return null;
    const section = editor.artifact.sections.find((s) => s.id === address.section);
    const composed = section ? composedLeafFor(section, address, paintedCtx(section)) : null;
    if (composed) return composed;
    const base = editorTokens();
    const tokens = section ? sectionContentTokens(section, base) : base;
    return spec.layout(inst.data, { ...paintedCtx(section), theme: tokens }).text ?? null;
}
