import type { RenderCommand } from "@engine/render-command";

// Pagination/fragmentation: slice a tall flow of render commands into fixed-height pages. Greedy
// "good, not optimal" (the doc's recommended first cut): break at the lowest command bottom-edge
// that lies within the page and doesn't cut through any other command; hard-break only when a single
// block is taller than the page. Each returned page's commands are offset to start at y = 0.

const EPS = 0.5;

function shiftY(c: RenderCommand, dy: number): RenderCommand {
    return { ...c, box: { ...c.box, y: c.box.y + dy } };
}

export function fragment(commands: RenderCommand[], totalHeight: number, pageHeight: number): RenderCommand[][] {
    if (totalHeight <= pageHeight + EPS || pageHeight <= 0) return [commands.map((c) => c)];

    const sorted = [...commands].sort((a, b) => a.box.y - b.box.y);
    const pages: RenderCommand[][] = [];
    let top = 0;
    let guard = 0;

    while (top < totalHeight - EPS && guard++ < 4096) {
        const limit = top + pageHeight;
        let breakY = Math.min(limit, totalHeight);

        if (limit < totalHeight) {
            // candidate breaks: every command's bottom edge that falls inside this page
            const cands = sorted
                .map((c) => c.box.y + c.box.h)
                .filter((y) => y > top + EPS && y <= limit + EPS);
            cands.push(limit); // hard-break fallback
            cands.sort((a, b) => b - a);
            breakY = limit;
            for (const y of cands) {
                if (y <= top + EPS) continue;
                const splits = sorted.some((c) => c.box.y < y - EPS && c.box.y + c.box.h > y + EPS);
                if (!splits) {
                    breakY = y;
                    break;
                }
            }
        }

        const pageCmds = sorted
            .filter((c) => c.box.y < breakY - EPS && c.box.y + c.box.h > top + EPS)
            .map((c) => shiftY(c, -top));
        pages.push(pageCmds);
        top = breakY > top + EPS ? breakY : limit; // always make progress
    }

    return pages;
}
