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
