import { createSignal } from "solid-js";
import { api } from "@app/api";

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
 * Open the sheet on the most recent artifact, for a caller that wants to share but has none in hand
 * (the onboarding checklist's "Send it out"). A first session holds exactly one, so the newest is the
 * choice a person would make from a list of one, and a picker for it would be a list of one.
 *
 * Read fresh rather than off the library list, which may be scoped to a folder or a search. Answers
 * false when there is nothing to share, so the caller can do something else instead.
 */
export async function shareNewest(): Promise<boolean> {
    const page = await api.listArtifacts().catch(() => null);
    const newest = page?.artifacts[0];
    if (!newest) return false;
    openShare({ artifactId: newest.id, title: newest.title });
    return true;
}
