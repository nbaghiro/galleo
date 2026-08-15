import { createSignal } from "solid-js";
import { api, type ContextItemMeta, type ContextSummary, type NewContextItem } from "@app/api";
import { reportError } from "./errors";

// The context library, client side: one cached list + per-context item loads. Mutations reload
// from the server rather than mirroring writes — contexts change rarely and correctness wins.

const [contextList, setContextList] = createSignal<ContextSummary[]>([]);
const [contextsLoaded, setContextsLoaded] = createSignal(false);
export { contextList, contextsLoaded };

export async function loadContexts(): Promise<void> {
    try {
        const { contexts } = await api.listContexts();
        setContextList(contexts);
    } catch (e) {
        reportError(e, "Couldn’t load your contexts");
    } finally {
        setContextsLoaded(true);
    }
}

export async function createContext(name: string, description?: string): Promise<string | null> {
    try {
        const { id } = await api.createContext(name, description);
        await loadContexts();
        return id;
    } catch (e) {
        reportError(e, "Couldn’t create that context");
        return null;
    }
}

export async function updateContext(
    id: string,
    patch: { name?: string; description?: string | null },
): Promise<void> {
    try {
        await api.updateContext(id, patch);
        await loadContexts();
    } catch (e) {
        reportError(e, "Couldn’t update that context");
    }
}

export async function deleteContext(id: string): Promise<void> {
    try {
        await api.deleteContext(id);
        await loadContexts();
    } catch (e) {
        reportError(e, "Couldn’t delete that context");
    }
}

export async function loadItems(contextId: string): Promise<ContextItemMeta[]> {
    const { items } = await api.getContextItems(contextId);
    return items;
}

/** Returns the created item, or null with the error surfaced (link fetches can legitimately fail). */
export async function addItem(
    contextId: string,
    item: NewContextItem,
): Promise<ContextItemMeta | null> {
    try {
        const { item: created } = await api.addContextItem(contextId, item);
        void loadContexts(); // item counts on the list
        return created;
    } catch (e) {
        reportError(e, "Couldn’t add that to the context");
        return null;
    }
}

export async function removeItem(contextId: string, itemId: string): Promise<boolean> {
    try {
        await api.removeContextItem(contextId, itemId);
        void loadContexts();
        return true;
    } catch (e) {
        reportError(e, "Couldn’t remove that item");
        return false;
    }
}

export async function resyncItem(contextId: string, itemId: string): Promise<boolean> {
    try {
        await api.resyncContextItem(contextId, itemId);
        return true;
    } catch (e) {
        reportError(e, "Couldn’t re-sync that item");
        return false;
    }
}
