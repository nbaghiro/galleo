import type { EngineNode, TextLeaf } from "@engine/node";
import type { ElementAddress, Section } from "@model/artifact";
import type { LayoutCtx } from "@elements/spec";
import { composedNodeFor, firstTextLeaf, nodeById, sectionContentTokens } from "@elements/compose";
import { childrenOf, getElementAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { elementRegionId } from "@model/artifact";
import { panelHugWidth, panelNode, panelWidth, popupData } from "@elements/composite/popup";
import { profileFor } from "@engine/profile";
import type { RunLayout } from "@canvas/render/commands";
import { LINE_HEIGHT_FACTOR, ctxFor, measureText } from "@canvas/render/commands";
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

// A popup's panel floats over the canvas instead of painting in flow, so its subtree reaches the
// screen through an overlay rather than through composeSection. One definition of that subtree, so
// the overlay's paint and the chrome that has to match it (the inline text editor) cannot drift.

const isOpenPopup = (type: string, data: unknown): boolean =>
    type === "popup" && (data as { open?: unknown }).open === true;

/** Every popup the author left open, in tree order. Cheap: no compose until a panel is asked for. */
export function openPopups(): ElementAddress[] {
    const out: ElementAddress[] = [];
    const walk = (address: ElementAddress): void => {
        const inst = getElementAt(editor.artifact, address);
        if (!inst) return;
        if (isOpenPopup(inst.type, inst.data)) out.push(address);
        childrenOf(inst)?.forEach((_, i) =>
            walk({ section: address.section, path: [...address.path, i] }),
        );
    };
    for (const s of editor.artifact.sections) walk({ section: s.id, path: [] });
    return out;
}

export interface Panel {
    width: number;
    node: EngineNode; // addressed, so its regions are the ones the editor publishes
}

/** The floating panel for a popup address, at the width the canvas paints it. */
export function panelFor(popup: ElementAddress): Panel | null {
    const inst = getElementAt(editor.artifact, popup);
    if (!inst || inst.type !== "popup") return null;
    const section = editor.artifact.sections.find((s) => s.id === popup.section);
    const theme = section ? sectionContentTokens(section, editorTokens()) : editorTokens();
    const data = popupData(inst.data as Record<string, unknown>);
    const max = panelWidth(canvasContentWidth());
    const ctx = ctxFor(max, theme, profileFor(editor.artifact));
    const node = panelNode(data, ctx, popup);
    return { width: panelHugWidth(data, node, measureText, canvasContentWidth()), node };
}

// the nearest ancestor whose open panel is what actually paints this address, if any
function panelNodeFor(address: ElementAddress): EngineNode | null {
    for (let n = address.path.length - 1; n >= 0; n--) {
        const popup: ElementAddress = { section: address.section, path: address.path.slice(0, n) };
        const inst = getElementAt(editor.artifact, popup);
        if (!inst || !isOpenPopup(inst.type, inst.data)) continue;
        const panel = panelFor(popup);
        return panel ? nodeById(panel.node, elementRegionId(address)) : null;
    }
    return null;
}

// the engine subtree for an address as painted (ramp, restyling, contrast swap included)
export function paintedNodeFor(address: ElementAddress): EngineNode | null {
    const panelled = panelNodeFor(address);
    if (panelled) return panelled;
    const section = editor.artifact.sections.find((s) => s.id === address.section);
    return section ? composedNodeFor(section, address, paintedCtx(section)) : null;
}

/** The painted leaf's line boxes at its painted width — the same memoized entry the paint read. */
export function paintedLinesFor(address: ElementAddress, width: number): RunLayout | null {
    const leaf = paintedLeafFor(address);
    if (!leaf) return null;
    const m = measureText(leaf, width);
    if (!m.lines) return null;
    const lineHeight = leaf.lineHeight ?? leaf.size * LINE_HEIGHT_FACTOR;
    return { lines: m.lines, width: m.width, height: m.height, lineHeight };
}

// The text leaf for an address as painted, for chrome that must match the screen (the inline
// editor's overlay, the bar's color swatch). The composed leaf carries container restyling and
// the section's contrast swap; the spec's own leaf covers a bare element.
export function paintedLeafFor(address: ElementAddress): TextLeaf | null {
    const inst = getElementAt(editor.artifact, address);
    const spec = inst ? getElement(inst.type) : undefined;
    if (!inst || !spec) return null;
    const panelled = panelNodeFor(address)?.text;
    if (panelled) return panelled;
    const section = editor.artifact.sections.find((s) => s.id === address.section);
    // an inline label is an anonymous child leaf, so its element's node descends to it
    const leafOf = (node: EngineNode | null): TextLeaf | null =>
        node && (node.text ?? (spec.inlineText ? firstTextLeaf(node) : null));
    const composed = section
        ? leafOf(composedNodeFor(section, address, paintedCtx(section)))
        : null;
    if (composed) return composed;
    const base = editorTokens();
    const tokens = section ? sectionContentTokens(section, base) : base;
    return leafOf(spec.layout(inst.data, { ...paintedCtx(section), theme: tokens }));
}
