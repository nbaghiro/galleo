import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { ExportFormat } from "@model/billing";
import type { FormatDescriptor } from "@model/geometry";
import { resolveProfile } from "@engine/profile";
import { sectionSlides } from "@canvas/render/commands";
import { exportPdfAuto, exportPrint, exportSectionPngs, PRINT_W } from "@canvas/render/export";
import { exportPptx } from "@canvas/render/pptx";
import { ScaledSectionCanvas } from "@ui/section";
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
    const docW = docProfile.maxContentWidth ?? PRINT_W;
    const nSections = createMemo(() => editor.artifact.sections.length);
    const nSlides = createMemo(() =>
        editor.artifact.sections.reduce(
            (n, s) => n + sectionSlides(s, editorTokens(), profile()).length,
            0,
        ),
    );

    // how the chosen destination frames each section cell
    const cell = createMemo(
        (): {
            frame: "slide" | "natural";
            profile: FormatDescriptor;
            layoutWidth?: number;
            width: number;
        } => {
            const d = dest();
            const slide = { frame: "slide" as const, profile: profile(), width: 280 };
            if (d === "pptx") return slide;
            // print always composes as a doc (paper is continuous), whatever the format toggle
            const docPage = {
                frame: "natural" as const,
                profile: docProfile,
                layoutWidth: docW,
                width: 210,
            };
            if (d === "print") return docPage;
            // pdf + png mirror the export: continuous → natural per-section pages, paged → slides
            return continuous() ? docPage : slide;
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

    const caption = (ix: number, id: string): string => {
        if (dest() === "png") {
            const stem = `${String(ix + 1).padStart(2, "0")}-${id}`;
            return `${stem.length > 18 ? `${stem.slice(0, 17)}…` : stem}.png`;
        }
        return dest() === "pptx" ? `slide ${ix + 1}` : `page ${ix + 1}`;
    };

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
            class="flex h-[min(700px,90vh)] w-[min(920px,94vw)] flex-col overflow-hidden"
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
                                "border-ink bg-ink text-bg": dest() === d.id,
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

            <div class="min-h-0 flex-1 overflow-auto bg-ink/90">
                <div class="flex min-h-full w-max min-w-full items-center gap-5 px-6 py-6">
                    <For each={editor.artifact.sections}>
                        {(section, ix) => (
                            <div class="flex-none">
                                <ScaledSectionCanvas
                                    section={section}
                                    theme={editorTokens()}
                                    profile={cell().profile}
                                    frame={cell().frame}
                                    layoutWidth={cell().layoutWidth}
                                    width={cell().width}
                                    lazy
                                    baseShadow
                                    radius={3}
                                />
                                <div class="mt-2 text-center font-mono text-[9.5px] text-bg/70">
                                    {caption(ix(), section.id)}
                                </div>
                            </div>
                        )}
                    </For>
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
