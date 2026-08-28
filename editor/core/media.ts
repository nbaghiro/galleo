import type { IconPick, MediaItem, MediaKind } from "@model/media";
import { clearBackgroundImage } from "@elements/ops";
import { commit, editor, requestMediaPicker } from "./store";

// pass onRemove when a value is already set, so the picker offers a "Remove" action
export function pickMedia(
    onPick: (url: string, item?: MediaItem, kind?: MediaKind) => void,
    kind?: MediaKind,
    onRemove?: () => void,
): void {
    requestMediaPicker({ onPick, kind, onRemove });
}

export interface Dims {
    w: number;
    h: number;
}

/** A source's pixel size, when it reported a usable one (a picked item, or a probed element). */
export function dimsOf(src?: { width?: number; height?: number }): Dims | undefined {
    const w = src?.width ?? 0;
    const h = src?.height ?? 0;
    return w > 0 && h > 0 ? { w, h } : undefined;
}

/**
 * One-shot natural-size probe for a hand-typed url. Resolves undefined when the image errors or
 * never loads, so a url the browser cannot fetch simply carries no dims.
 */
export function probeImage(src: string, timeoutMs = 4000): Promise<Dims | undefined> {
    return new Promise((resolve) => {
        const img = new Image();
        let timer = 0;
        const done = (dims?: Dims): void => {
            window.clearTimeout(timer);
            img.onload = null;
            img.onerror = null;
            resolve(dims);
        };
        timer = window.setTimeout(() => done(), timeoutMs);
        img.onload = () => done(dimsOf({ width: img.naturalWidth, height: img.naturalHeight }));
        img.onerror = () => done();
        img.src = src;
    });
}

export function pickIcon(onPickIcon: (icon: IconPick) => void): void {
    requestMediaPicker({ kind: "icon", onPick: () => {}, onPickIcon });
}

export function pickArtifactBackground(): void {
    const bg = editor.artifact.background;
    pickMedia(
        (url) =>
            commit({
                ...editor.artifact,
                background: { ...bg, kind: "image", image: url },
            }),
        "photo",
        bg?.image
            ? () => commit({ ...editor.artifact, background: clearBackgroundImage(bg) })
            : undefined,
    );
}
