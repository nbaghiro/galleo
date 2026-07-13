import { createSignal } from "solid-js";
import { api, type LinkSummary } from "../api";

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
