import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { getSuggestSections } from "../editor";

function collectTypes(el: ElementInstance | undefined, into: Set<string>): void {
    if (!el) return;
    into.add(el.type);
    const kids = (el.data as { children?: ElementInstance[] }).children;
    if (Array.isArray(kids)) kids.forEach((k) => collectTypes(k, into));
}

function firstText(section: Section): string {
    let found = "";
    const visit = (el?: ElementInstance): void => {
        if (found || !el) return;
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) {
            found = d.text.trim();
            return;
        }
        d.children?.forEach(visit);
    };
    visit(section.root);
    return found;
}

function typesOf(content: ArtifactContent): Set<string> {
    const types = new Set<string>();
    for (const s of content.sections) collectTypes(s.root, types);
    return types;
}

export function suggestSections(content: ArtifactContent, n = 6): string[] {
    const t = typesOf(content);
    const has = (kind: string): boolean => t.has(kind);
    const rules: { on: boolean; text: string; w: number }[] = [
        { on: !has("stat"), text: "Add the key numbers as stats", w: 9 },
        { on: !has("button"), text: "Add a closing call-to-action", w: 9 },
        { on: !has("quote"), text: "Add a customer quote", w: 8 },
        { on: has("quote"), text: "Add another voice or testimonial", w: 4 },
        { on: !has("chart"), text: "Visualize a trend in a chart", w: 7 },
        { on: !has("table"), text: "Add a comparison table", w: 6 },
        { on: !has("diagram"), text: "Show the process as a diagram", w: 5 },
        { on: !has("card"), text: "Break the highlights into three cards", w: 4 },
        // evergreen — always eligible, low weight, so short artifacts still fill out
        { on: true, text: "Add a proof or results section", w: 3 },
        { on: true, text: "Add a “how it works” section", w: 2 },
        { on: true, text: "Add an FAQ or objections section", w: 1 },
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rules.filter((r) => r.on).sort((a, b) => b.w - a.w)) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        out.push(r.text);
        if (out.length >= n) break;
    }
    return out;
}

// cache key: a suggestion set is reused until the section count or opening headline changes
function cacheKey(id: string, content: ArtifactContent): string {
    const head = content.sections[0] ? firstText(content.sections[0]).slice(0, 48) : "";
    return `${id}:${content.sections.length}:${head}`;
}

const llmCache = new Map<string, string[]>();

export function hasCachedSuggestions(id: string, content: ArtifactContent): boolean {
    return llmCache.has(cacheKey(id, content));
}

export async function fetchSuggestions(
    id: string,
    content: ArtifactContent,
    force = false,
): Promise<string[]> {
    const key = cacheKey(id, content);
    if (!force) {
        const hit = llmCache.get(key);
        if (hit) return hit;
    }
    const handler = getSuggestSections();
    if (!handler) return suggestSections(content);
    try {
        const got = await handler(content);
        const list = got.filter((s) => typeof s === "string" && s.trim()).slice(0, 6);
        const result = list.length ? list : suggestSections(content);
        llmCache.set(key, result);
        return result;
    } catch {
        return suggestSections(content);
    }
}
