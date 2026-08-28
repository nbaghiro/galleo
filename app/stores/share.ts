import { createSignal } from "solid-js";

export interface ShareRequest {
    artifactId: string;
    title: string;
}

const [shareRequest, setShareRequest] = createSignal<ShareRequest | null>(null);
export { shareRequest };

export function openShare(req: ShareRequest): void {
    setShareRequest(req);
}

export function closeShare(): void {
    setShareRequest(null);
}

/**
 * A caller with no artifact in hand (the onboarding checklist) asking to choose one. The Shared page
 * already owns that picker, along with the list it filters and the badges marking what is shared
 * already, so this asks that page to open it rather than standing up a second one.
 */
const [sharePickerWanted, setSharePickerWanted] = createSignal(false);
export function requestSharePicker(): void {
    setSharePickerWanted(true);
}

/** True once, for the page that answers the request. */
export function takeSharePickerRequest(): boolean {
    if (!sharePickerWanted()) return false;
    setSharePickerWanted(false);
    return true;
}
