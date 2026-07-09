import { createSignal } from "solid-js";

// The Share modal's open state. A request carries the artifact being shared (id + title) so the modal can
// load its publish state and publish / manage links. Mounted once at the app root (like the media picker
// and theme drawer); opened from the editor topbar via the `requestShare` bridge in @editor/editor.

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
