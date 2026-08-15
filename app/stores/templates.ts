import type { Template } from "@model/templates";
import { api } from "@app/api";

// One fetch of the template bodies per session, shared by every surface that needs them (the
// intake's template row, chat's start-from-template). The edge-safe TEMPLATE_INDEX stays the
// source for names; this resolves bodies plus the measured use counts the row orders by.

interface TemplateCatalog {
    templates: Template[];
    uses: Record<string, number>;
}

let cache: TemplateCatalog | null = null;
let inflight: Promise<TemplateCatalog> | null = null;

function catalogOnce(): Promise<TemplateCatalog> {
    if (cache) return Promise.resolve(cache);
    inflight ??= api
        .listTemplates()
        .then((r) => (cache = r))
        .finally(() => (inflight = null));
    return inflight;
}

export function templatesOnce(): Promise<Template[]> {
    return catalogOnce().then((c) => c.templates);
}

/** template id → how many times anyone, anywhere, started from it */
export function templateUsesOnce(): Promise<Record<string, number>> {
    return catalogOnce().then((c) => c.uses);
}
