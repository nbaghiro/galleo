import type { Component } from "solid-js";
import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import type { ExportFormat } from "@model/billing";
import { profileFor } from "@engine/profile";
import { sectionSlides } from "@canvas/render/commands";
import {
    buildPdfAuto,
    buildSectionPngs,
    buildSectionPngZip,
    downloadBytes,
    exportPrint,
    type SectionPng,
} from "@canvas/render/export";
import { buildPptx } from "@canvas/render/pptx";
import { Icon } from "@ui/icons";
import { Badge, Button, Spinner } from "@ui/button";
import { Modal } from "@ui/overlay";
import { cachedExport } from "../core/exportCache";
import {
    currentArtifactId,
    editSeq,
    editor,
    editorTokens,
    ensureAllSections,
    features,
    requestUpgrade,
} from "../core/store";

const [target, setTarget] = createSignal(false);
export function openExportModal(): void {
    // export needs the whole document, so a windowed artifact fills in the rest first
    void ensureAllSections();
    setTarget(true);
}
const close = (): void => {
    setTarget(false);
};

type Dest = Exclude<ExportFormat, "slides">; // the four shipped destinations

// destination brand marks — fixed on purpose, they represent the target apps, not the theme
const DESTS: { id: Dest; label: string; mark: string; markBg: string }[] = [
    { id: "pdf", label: "PDF", mark: "PDF", markBg: "#C2402C" },
    { id: "pptx", label: "PowerPoint", mark: "PPT", markBg: "#C75B12" },
    { id: "png", label: "Images", mark: "ZIP", markBg: "#3F6E8F" },
    { id: "print", label: "Print", mark: "🖨", markBg: "#57544C" },
];

const CTA: Record<Dest, string> = {
    pdf: "Export PDF",
    pptx: "Export PowerPoint",
    png: "Export ZIP",
    print: "Open print dialog",
};

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type Preview =
    | { kind: "pdf"; url: string }
    | { kind: "pages"; pages: { url: string; caption: string }[] };

const blobUrl = (bytes: Uint8Array, type: string): string =>
    URL.createObjectURL(new Blob([bytes as BlobPart], { type }));

const toPages = (files: SectionPng[], caption: (f: SectionPng, i: number) => string): Preview => ({
    kind: "pages",
    pages: files.map((f, i) => ({ url: blobUrl(f.bytes, "image/png"), caption: caption(f, i) })),
});

const disposePreview = (p: Preview): void => {
    if (p.kind === "pdf") URL.revokeObjectURL(p.url);
    else p.pages.forEach((x) => URL.revokeObjectURL(x.url));
};

const Body: Component = () => {
    const [dest, setDest] = createSignal<Dest>("pdf");
    const [busy, setBusy] = createSignal(false);

    const profile = createMemo(() => profileFor(editor.artifact));
    const continuous = createMemo(() => profile().kind === "continuous");
    const brand = createMemo(() => !features().removeBranding);
    // one build per destination per artifact state; tab hops and the Export click reuse it
    const fp = createMemo(() => `${currentArtifactId()}:${editSeq()}:${brand() ? 1 : 0}`);

    const nSections = createMemo(() => editor.artifact.sections.length);
    const nSlides = createMemo(() =>
        editor.artifact.sections.reduce(
            (n, s) => n + sectionSlides(s, editorTokens(), profile()).length,
            0,
        ),
    );

    // the real export artifacts, not re-renders
    const pdfBuild = (): Promise<{ bytes: Uint8Array; filename: string; url: string }> =>
        cachedExport(
            "pdf",
            fp(),
            async () => {
                const b = await buildPdfAuto(editor.artifact, editorTokens(), { brand: brand() });
                return { ...b, url: blobUrl(b.bytes, "application/pdf") };
            },
            (v) => URL.revokeObjectURL(v.url),
        );
    const pngFiles = (): Promise<SectionPng[]> =>
        cachedExport("pngs", fp(), () =>
            buildSectionPngs(editor.artifact, editorTokens(), { brand: brand() }),
        );
    const pngZip = (): Promise<Uint8Array> =>
        cachedExport("zip", fp(), async () => buildSectionPngZip(await pngFiles()));
    const pptxBytes = (): Promise<Uint8Array> =>
        cachedExport("pptx", fp(), () =>
            buildPptx(editor.artifact, editorTokens(), { brand: brand() }),
        );
    const pngPreview = (): Promise<Preview> =>
        cachedExport(
            "pngs:preview",
            fp(),
            async () => toPages(await pngFiles(), (f) => f.name),
            disposePreview,
        );
    // the same slides the deck carries, rendered by the same pipeline
    const pptxPreview = (): Promise<Preview> =>
        cachedExport(
            "pptx:preview",
            fp(),
            async () =>
                toPages(
                    await buildSectionPngs(editor.artifact, editorTokens(), {
                        brand: brand(),
                        compose: "slides",
                    }),
                    (_f, i) => `slide ${i + 1}`,
                ),
            disposePreview,
        );
    // print composes as a doc, unbranded (the print path stamps nothing)
    const printPreview = (): Promise<Preview> =>
        cachedExport(
            "print:preview",
            fp(),
            async () =>
                toPages(
                    await buildSectionPngs(editor.artifact, editorTokens(), { compose: "doc" }),
                    (_f, i) => `page ${i + 1}`,
                ),
            disposePreview,
        );

    const [preview, { refetch }] = createResource(
        () => ({ d: dest(), fp: fp() }),
        async ({ d }): Promise<Preview> => {
            if (d === "pdf") return { kind: "pdf", url: (await pdfBuild()).url };
            if (d === "pptx") return pptxPreview();
            if (d === "png") return pngPreview();
            return printPreview();
        },
    );

    const pages = createMemo(() => (continuous() ? nSections() : nSlides()));
    const note = createMemo((): string => {
        const n = nSections();
        switch (dest()) {
            case "pdf":
                return continuous()
                    ? `${n} sections → ${n} pages · natural heights · vector text`
                    : `${n} sections → ${nSlides()} slide pages · vector text`;
            case "pptx":
                return `${n} sections → ${nSlides()} slides · text stays editable`;
            case "png":
                return `${n} sections → ${pages()} PNGs · named by order + section · zipped`;
            default:
                return `${n} sections → doc layout on your printer's paper · backgrounds kept`;
        }
    });

    const allowed = (d: Dest): boolean => features().exportFormats.includes(d);
    const run = async (): Promise<void> => {
        const d = dest();
        if (!allowed(d)) {
            requestUpgrade();
            return;
        }
        setBusy(true);
        try {
            if (d === "pdf") {
                const b = await pdfBuild();
                downloadBytes(b.bytes, b.filename, "application/pdf");
            } else if (d === "pptx") downloadBytes(await pptxBytes(), "galleo.pptx", PPTX_MIME);
            else if (d === "png")
                downloadBytes(await pngZip(), "galleo-sections.zip", "application/zip");
            else await exportPrint(editor.artifact, editorTokens());
            close();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            onClose={close}
            scrim="blur"
            size="full"
            class="flex h-[min(980px,94vh)] w-[min(1520px,96vw)] flex-col overflow-hidden"
        >
            <div class="flex items-center gap-3 border-b border-line px-5 py-3.5">
                <div class="text-[15px] font-semibold">Export</div>
                <Badge tone="outline" size="md" weight="medium">
                    {editor.artifact.format}
                </Badge>
                <div class="flex-1" />
            </div>

            <div class="flex gap-1.5 border-b border-line px-4 py-2.5">
                <For each={DESTS}>
                    {(d) => (
                        <button
                            class="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                            classList={{
                                "border-ink bg-ink text-canvas": dest() === d.id,
                                "border-line text-soft hover:border-muted": dest() !== d.id,
                            }}
                            onClick={() => setDest(d.id)}
                        >
                            <span
                                class="grid h-4.5 w-4.5 place-items-center rounded font-mono text-[6.5px] font-bold text-white"
                                style={{ background: d.markBg }}
                            >
                                {d.mark}
                            </span>
                            {d.label}
                            <Show when={!allowed(d.id)}>
                                <Icon name="lock" size={11} />
                            </Show>
                        </button>
                    )}
                </For>
            </div>

            <div class="min-h-0 flex-1 overflow-hidden bg-ink/90">
                <Switch>
                    <Match when={preview.loading}>
                        <div class="flex h-full flex-col items-center justify-center gap-3 text-canvas/80">
                            <Spinner size={20} tone="accent" />
                            <span class="text-[13px]">
                                Rendering {DESTS.find((d) => d.id === dest())?.label}…
                            </span>
                        </div>
                    </Match>
                    <Match when={preview.error}>
                        <div class="flex h-full flex-col items-center justify-center gap-3 text-canvas/80">
                            <span class="text-[13px]">Preview failed to render.</span>
                            <Button variant="outline" size="sm" onClick={() => void refetch()}>
                                Try again
                            </Button>
                        </div>
                    </Match>
                    <Match when={preview()?.kind === "pdf" && preview()}>
                        {(p) => (
                            <iframe
                                title="PDF preview"
                                src={`${(p() as Extract<Preview, { kind: "pdf" }>).url}#toolbar=0&navpanes=0&view=FitH`}
                                class="h-full w-full border-0"
                            />
                        )}
                    </Match>
                    <Match when={preview()?.kind === "pages" && preview()}>
                        {(p) => (
                            <div class="h-full overflow-y-auto">
                                <div class="mx-auto flex w-fit flex-col items-center gap-5 py-7">
                                    <For each={(p() as Extract<Preview, { kind: "pages" }>).pages}>
                                        {(page) => (
                                            <div>
                                                <img
                                                    src={page.url}
                                                    alt={page.caption}
                                                    class="block max-w-[min(1100px,88vw)] rounded-sm shadow-2xl"
                                                />
                                                <div class="mt-2 text-center font-mono text-[9.5px] text-canvas/70">
                                                    {page.caption}
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                        )}
                    </Match>
                </Switch>
            </div>

            <div class="border-t border-line px-5 py-2.5 font-mono text-[11.5px] text-muted">
                {note()}
            </div>

            <div class="flex items-center gap-2.5 border-t border-line px-5 py-3">
                <Show when={!features().removeBranding}>
                    <span class="text-[12px] text-muted">
                        Adds a small "Made with Galleo" mark —{" "}
                        <button class="font-semibold text-accent" onClick={() => requestUpgrade()}>
                            upgrade to remove
                        </button>
                    </span>
                </Show>
                <div class="flex-1" />
                <Button variant="tool" size="md" onClick={close}>
                    Cancel
                </Button>
                <Button variant="primary" size="md" loading={busy()} onClick={() => void run()}>
                    <Show when={allowed(dest())} fallback={<Icon name="lock" size={13} />}>
                        <Icon name="export" size={13} />
                    </Show>
                    {CTA[dest()]}
                </Button>
            </div>
        </Modal>
    );
};

export const ExportModal: Component = () => (
    <Show when={target()}>
        <Body />
    </Show>
);
