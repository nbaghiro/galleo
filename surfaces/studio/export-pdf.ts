import { resolveTheme } from "@themes/library";
import { paint } from "./dom-backend";
import { editor } from "./editor";
import { measureText } from "./measure";
import { layoutSection } from "./render";

const PAGE_W = 1100;

// Export to PDF via the browser print dialog: render every section into a hidden print container
// (one page per section), then print. (#galleo-print is shown only in @media print — see studio.css.)
export function exportPrint(): void {
    const theme = resolveTheme(editor.artifact.theme).tokens;
    const container = document.createElement("div");
    container.id = "galleo-print";

    for (const section of editor.artifact.sections) {
        const { commands, height } = layoutSection(section, PAGE_W, measureText, theme);
        const page = document.createElement("div");
        page.style.cssText = `position:relative;width:${PAGE_W}px;height:${height}px;background:${theme.bg};break-after:page;page-break-after:always`;
        paint(commands, page);
        container.appendChild(page);
    }

    document.body.appendChild(container);
    window.print();
    container.remove();
}
