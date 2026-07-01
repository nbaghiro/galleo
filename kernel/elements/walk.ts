import type { ElementInstance, Section } from "@model/content";

// Visit every element in a section — each cell's element, then recursively any group children —
// depth-first in cell order. The single place the content tree's element traversal lives.
export function walkElements(section: Section, visit: (el: ElementInstance) => void): void {
    const recurse = (el?: ElementInstance): void => {
        if (!el) return;
        visit(el);
        const kids = (el.data as { children?: ElementInstance[] }).children;
        if (Array.isArray(kids)) kids.forEach(recurse);
    };
    for (const cell of Object.values(section.cells)) recurse(cell.element);
}
