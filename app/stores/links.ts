import { createSignal } from "solid-js";
import { api, type LinkSummary } from "../api";

// The workspace's published links — the data behind the Shared tab (which is just the full list of links,
// filterable by type). Refreshed on mount and whenever the Share modal closes (a publish / unpublish /
// recipient change there should reflect here).

const [links, setLinks] = createSignal<LinkSummary[]>([]);
const [linksLoaded, setLinksLoaded] = createSignal(false);
export { links, linksLoaded };

export async function loadLinks(): Promise<void> {
    try {
        setLinks((await api.listLinks()).links);
    } catch {
        /* signed out / no workspace — keep what we have */
    } finally {
        setLinksLoaded(true);
    }
}
