import type { ElementInstance, Section } from "@model/artifact";
import { childrenRaw, updateAtPath } from "@model/section";

export interface Passage {
    path: number[]; // into the section root, for updateAtPath
    text: string;
}

const textOf = (el: ElementInstance): string | undefined => {
    const t = (el.data as { text?: unknown }).text;
    return typeof t === "string" && t.trim() ? t : undefined;
};

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

// every text-bearing node, in document order
export function textNodes(root: ElementInstance): Passage[] {
    const out: Passage[] = [];
    const walk = (el: ElementInstance, path: number[]): void => {
        const text = textOf(el);
        if (text) out.push({ path, text });
        childrenRaw(el)?.forEach((child, i) => walk(child, [...path, i]));
    };
    walk(root, []);
    return out;
}

/** Exact (normalized) match wins, else the shortest containing node; null when nothing matches. */
export function findPassage(root: ElementInstance, find: string): Passage | null {
    const needle = norm(find);
    if (!needle) return null;
    const nodes = textNodes(root);

    const exact = nodes.find((n) => norm(n.text) === needle);
    if (exact) return exact;

    const containing = nodes
        .filter((n) => norm(n.text).includes(needle))
        .sort((a, b) => a.text.length - b.text.length);
    return containing[0] ?? null;
}

export function replacePassage(section: Section, path: number[], text: string): Section {
    return {
        ...section,
        root: updateAtPath(section.root, path, (el) => ({
            ...el,
            data: { ...(el.data as Record<string, unknown>), text },
        })),
    };
}

export interface Located {
    path: number[];
    element: ElementInstance;
}

// every element of a type, in document order — `nth` picks between them
export function findElement(root: ElementInstance, type: string, nth = 0): Located | null {
    const found: Located[] = [];
    const walk = (el: ElementInstance, path: number[]): void => {
        if (el.type === type) found.push({ path, element: el });
        childrenRaw(el)?.forEach((child, i) => walk(child, [...path, i]));
    };
    walk(root, []);
    return found[nth] ?? null;
}

// what the section actually contains, so a miss can tell the model what it could have aimed at
export function elementTypes(root: ElementInstance): string[] {
    const seen: string[] = [];
    const walk = (el: ElementInstance): void => {
        if (!seen.includes(el.type)) seen.push(el.type);
        childrenRaw(el)?.forEach(walk);
    };
    walk(root);
    return seen;
}

export function replaceElement(
    section: Section,
    path: number[],
    element: ElementInstance,
): Section {
    return { ...section, root: updateAtPath(section.root, path, () => element) };
}

// an image element carries its phrase-or-url in data.src; resolveImages turns a phrase into a real one
export function setImageSrc(section: Section, path: number[], src: string): Section {
    return {
        ...section,
        root: updateAtPath(section.root, path, (el) => ({
            ...el,
            data: { ...(el.data as Record<string, unknown>), src },
        })),
    };
}
