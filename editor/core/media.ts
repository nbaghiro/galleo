import type { IconPick, MediaItem, MediaKind } from "@model/media";
import { clearBackgroundImage } from "@elements/ops";
import { commit, editor, requestMediaPicker } from "./store";

// pass onRemove when a value is already set, so the picker offers a "Remove" action
export function pickMedia(
    onPick: (url: string, item?: MediaItem) => void,
    kind?: MediaKind,
    onRemove?: () => void,
): void {
    requestMediaPicker({ onPick, kind, onRemove });
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
