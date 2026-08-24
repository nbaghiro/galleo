import type { ArtifactContent, Section } from "@model/artifact";
import { asFormat } from "@model/analytics";
import { capture } from "@ui/analytics";
import { api } from "@app/api";
import { persistArtifact } from "./library";

// File → artifact, the reverse of export. PowerPoint and Google Slides parse on the server
// (services/core/import) into structured sections; a PDF becomes one static page image per
// section, rendered here with pdf.js because the browser already has a canvas and the server
// deliberately has none. Router-free: callers navigate with the returned id.

export type ImportKind = "pdf" | "pptx" | "slides";

export interface ImportProgress {
    stage: "reading" | "uploading" | "building";
    page?: number;
    pages?: number;
}

const MAX_PDF_PAGES = 150;
const PAGE_RENDER_W = 1600; // device px per rendered page; crisp on a 1280-wide slide
const ARTIFACT_W = 1280;

export function importKindOf(file: File): "pdf" | "pptx" | null {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
    if (
        name.endsWith(".pptx") ||
        file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
        return "pptx";
    return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// one static image section per page; the artifact page takes the first page's shape and a page
// with a different shape carries its own frame aspect
export function pdfPagesContent(pages: { url: string; w: number; h: number }[]): ArtifactContent {
    const first = pages[0];
    const pageH = first ? Math.round((ARTIFACT_W * first.h) / first.w) : 720;
    const pageAspect = first ? first.w / first.h : 16 / 9;
    const sections: Section[] = pages.map((p, i) => {
        const aspect = p.w / p.h;
        return {
            id: `s-${i + 1}`,
            root: {
                type: "image",
                data: {
                    src: p.url,
                    alt: `Page ${i + 1}`,
                    aspect: round2(aspect),
                    dims: { w: p.w, h: p.h },
                    fit: "contain",
                    radius: 0,
                },
            },
            ...(Math.abs(aspect - pageAspect) / pageAspect > 0.01
                ? { frame: { aspect: round2(aspect) } }
                : {}),
        };
    });
    return {
        format: "deck",
        theme: "studio",
        sections,
        ...(pageH !== 720 ? { page: { width: ARTIFACT_W, height: pageH } } : {}),
    };
}

const fileStem = (name: string): string => name.replace(/\.[^.]+$/, "").trim();

function fileBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
    });
}

async function renderPdfPages(
    file: File,
    onProgress?: (p: ImportProgress) => void,
): Promise<{ url: string; w: number; h: number }[]> {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES)
        throw new Error(`That PDF has ${doc.numPages} pages; the limit is ${MAX_PDF_PAGES}.`);
    const pages: { url: string; w: number; h: number }[] = [];
    const canvas = document.createElement("canvas");
    const cx = canvas.getContext("2d");
    if (!cx) throw new Error("no 2d canvas context");
    for (let n = 1; n <= doc.numPages; n++) {
        onProgress?.({ stage: "uploading", page: n, pages: doc.numPages });
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = base.clone({ scale: Math.min(3, PAGE_RENDER_W / base.width) });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, canvasContext: cx, viewport }).promise;
        const data = canvas.toDataURL("image/png").split(",")[1] ?? "";
        const { item } = await api.uploadMedia({
            data,
            mime: "image/png",
            name: `${fileStem(file.name)} page ${n}`,
            width: canvas.width,
            height: canvas.height,
        });
        pages.push({ url: item.url, w: canvas.width, h: canvas.height });
        page.cleanup();
    }
    await task.destroy();
    return pages;
}

async function persist(content: ArtifactContent, title: string): Promise<string> {
    const id = await persistArtifact(content, title);
    if (!id) throw new Error("The import couldn't be saved. Try again.");
    return id;
}

const countImages = (content: ArtifactContent): number => {
    let n = 0;
    const walk = (el: { type: string; data: unknown }): void => {
        if (el.type === "image") n++;
        const kids = (el.data as { children?: { type: string; data: unknown }[] }).children;
        if (Array.isArray(kids)) kids.forEach(walk);
    };
    for (const s of content.sections) {
        walk(s.root);
        if (s.background?.kind === "image") n++;
    }
    return n;
};

function done(format: ImportKind, content: ArtifactContent, startedAt: number): void {
    capture("artifact_imported", {
        import_format: format,
        section_count: content.sections.length,
        image_count: countImages(content),
        ms: Date.now() - startedAt,
    });
    capture("artifact_created", { source: "imported", format: asFormat(content.format) });
}

function failed(format: ImportKind, e: unknown): never {
    capture("import_failed", {
        import_format: format,
        reason: e instanceof Error ? e.name : "unknown",
    });
    throw e;
}

/** Imports a picked file; resolves to the new artifact's id. */
export async function importFile(
    file: File,
    onProgress?: (p: ImportProgress) => void,
): Promise<string> {
    const kind = importKindOf(file);
    if (!kind) throw new Error("That file isn't importable. Pick a .pdf or .pptx.");
    const startedAt = Date.now();
    try {
        if (kind === "pdf") {
            onProgress?.({ stage: "reading" });
            const pages = await renderPdfPages(file, onProgress);
            onProgress?.({ stage: "building" });
            const content = pdfPagesContent(pages);
            const id = await persist(content, fileStem(file.name) || "Imported PDF");
            done("pdf", content, startedAt);
            return id;
        }
        onProgress?.({ stage: "reading" });
        const data = await fileBase64(file);
        onProgress?.({ stage: "building" });
        const { content, title } = await api.importPptx({ name: file.name, data });
        const id = await persist(content, title);
        done("pptx", content, startedAt);
        return id;
    } catch (e) {
        failed(kind, e);
    }
}

/** Imports a public Google Slides link; resolves to the new artifact's id. */
export async function importSlidesUrl(
    url: string,
    onProgress?: (p: ImportProgress) => void,
): Promise<string> {
    const startedAt = Date.now();
    try {
        onProgress?.({ stage: "reading" });
        const { content, title } = await api.importSlides(url);
        onProgress?.({ stage: "building" });
        const id = await persist(content, title);
        done("slides", content, startedAt);
        return id;
    } catch (e) {
        failed("slides", e);
    }
}
