import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ExportFormat } from "@model/billing";
import { resolveProfile } from "@engine/profile";
import { sectionSlides } from "@canvas/render/commands";
import { backdropCss, paintSectionStack } from "@canvas/render/backends";
import { exportPdfAuto, exportPrint, exportSectionPngs } from "@canvas/render/export";
import { exportPptx } from "@canvas/render/pptx";
import { Icon } from "@ui/icons";
import { Badge, Button, IconButton } from "@ui/button";
import { Modal } from "@ui/overlay";
import { editor, editorTokens, features, requestUpgrade } from "../core/store";

const [target, setTarget] = createSignal(false);
export function openExportModal(): void {
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

const Body: Component = () => {
    const [dest, setDest] = createSignal<Dest>("pdf");
    const [busy, setBusy] = createSignal(false);

    const profile = createMemo(() => resolveProfile(editor.artifact.format));
    const continuous = createMemo(() => profile().kind === "continuous");
    const docProfile = resolveProfile("doc");
    const nSections = createMemo(() => editor.artifact.sections.length);
    const nSlides = createMemo(() =>
        editor.artifact.sections.reduce(
            (n, s) => n + sectionSlides(s, editorTokens(), profile()).length,
            0,
        ),
    );

    // print always composes as a doc (paper is continuous); pdf/png mirror their export path
    const previewProfile = createMemo(() =>
        dest() === "print" || (dest() !== "pptx" && continuous()) ? docProfile : profile(),
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

    // read-only editor-style stack, painted like the theme editor's live preview
    let pane!: HTMLDivElement;
    let host!: HTMLDivElement;
    const [paneW, setPaneW] = createSignal(0);
    onMount(() => {
        setPaneW(pane.clientWidth);
        const ro = new ResizeObserver(() => setPaneW(pane.clientWidth));
        ro.observe(pane);
        onCleanup(() => ro.disconnect());
    });
    createEffect(() => {
        const w = Math.max(360, paneW() - 56);
        const tk = editorTokens();
        host.replaceChildren();
        const { height } = paintSectionStack(host, editor.artifact.sections, previewProfile(), tk, {
            fullW: w,
        });
        host.style.cssText = `position:relative;width:${w}px;height:${height}px`;
    });

    const allowed = (d: Dest): boolean => features().exportFormats.includes(d);
    const run = async (): Promise<void> => {
        const d = dest();
        if (!allowed(d)) {
            requestUpgrade();
            return;
        }
        setBusy(true);
        const brand = !features().removeBranding;
        try {
            if (d === "pdf") await exportPdfAuto(editor.artifact, editorTokens(), { brand });
            else if (d === "pptx") await exportPptx(editor.artifact, editorTokens(), { brand });
            else if (d === "png")
                await exportSectionPngs(editor.artifact, editorTokens(), { brand });
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
            class="flex h-[min(920px,94vh)] w-[min(1200px,96vw)] flex-col overflow-hidden"
        >
            <div class="flex items-center gap-3 border-b border-line px-5 py-3.5">
                <div class="text-[15px] font-semibold">Export</div>
                <Badge tone="outline" size="md" weight="medium">
                    {editor.artifact.format}
                </Badge>
                <div class="flex-1" />
                <IconButton size="md" bordered tone="soft" title="Close" onClick={close}>
                    <Icon name="close" size={14} />
                </IconButton>
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

            <div
                ref={pane}
                class="min-h-0 flex-1 overflow-y-auto"
                style={{
                    background: backdropCss(editor.artifact.background, editorTokens()),
                    "background-size": "cover",
                    "background-position": "center",
                }}
            >
                <div class="flex justify-center py-7">
                    <div ref={host} />
                </div>
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
