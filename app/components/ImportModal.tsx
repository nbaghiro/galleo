import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Spinner } from "@ui/button";
import { Modal } from "@ui/overlay";
import { TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { importFile, importSlidesUrl, type ImportProgress } from "@app/stores/import";

const [target, setTarget] = createSignal(false);
export function openImportModal(): void {
    setTarget(true);
}

const ACCEPT = ".pdf,.pptx";

const progressLabel = (p: ImportProgress | null): string => {
    if (!p) return "Importing…";
    if (p.stage === "uploading" && p.page && p.pages)
        return `Rendering page ${p.page} of ${p.pages}…`;
    if (p.stage === "building") return "Building sections…";
    return "Reading the file…";
};

const Body: Component = () => {
    const navigate = useNavigate();
    const [busy, setBusy] = createSignal(false);
    const [progress, setProgress] = createSignal<ImportProgress | null>(null);
    const [error, setError] = createSignal("");
    const [url, setUrl] = createSignal("");
    const [over, setOver] = createSignal(false);
    let fileInput: HTMLInputElement | undefined;

    const close = (): void => {
        if (!busy()) setTarget(false);
    };

    const run = async (job: Promise<string>): Promise<void> => {
        setError("");
        setBusy(true);
        try {
            const id = await job;
            setTarget(false);
            navigate(`/edit/${id}`);
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : "The import failed. Try again.");
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    const pick = (file: File | undefined): void => {
        if (!file || busy()) return;
        void run(importFile(file, setProgress));
    };

    const fromUrl = (): void => {
        const u = url().trim();
        if (!u || busy()) return;
        void run(importSlidesUrl(u, setProgress));
    };

    return (
        <Modal onClose={close} size="md" class="w-[min(560px,92vw)] p-6">
            <h2 class="font-display text-[19px] font-semibold text-ink">Import</h2>
            <p class="mt-1 text-[13px] text-soft">
                PowerPoint imports as editable sections. A PDF becomes one image per page.
            </p>

            <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                class="hidden"
                onChange={(e) => {
                    pick(e.currentTarget.files?.[0]);
                    e.currentTarget.value = "";
                }}
            />
            <button
                class="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors"
                classList={{
                    "border-accent bg-accent/5": over(),
                    "border-line hover:border-muted": !over(),
                }}
                disabled={busy()}
                onClick={() => fileInput?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    pick(e.dataTransfer?.files?.[0]);
                }}
            >
                <Show
                    when={!busy()}
                    fallback={
                        <>
                            <Spinner size={18} tone="accent" />
                            <span class="text-[13px] text-soft">{progressLabel(progress())}</span>
                        </>
                    }
                >
                    <span class="rotate-180 text-muted">
                        <Icon name="export" size={20} />
                    </span>
                    <span class="text-[13.5px] font-semibold text-ink">
                        Drop a .pptx or .pdf here
                    </span>
                    <span class="text-[12px] text-muted">or click to browse</span>
                </Show>
            </button>

            <div class="mt-5 flex items-center gap-2.5">
                <TextField
                    class="min-w-0 flex-1"
                    placeholder="https://docs.google.com/presentation/…"
                    value={url()}
                    onChange={setUrl}
                    disabled={busy()}
                />
                <Button
                    variant="outline"
                    size="md"
                    disabled={busy() || !url().trim()}
                    onClick={fromUrl}
                >
                    Import link
                </Button>
            </div>
            <p class="mt-1.5 text-[11.5px] text-muted">
                A Google Slides link works when it is shared with anyone who has it.
            </p>

            <Show when={error()}>
                <p class="mt-3 text-[12.5px] leading-snug text-accent">{error()}</p>
            </Show>
        </Modal>
    );
};

export const ImportModal: Component = () => (
    <Show when={target()}>
        <Body />
    </Show>
);
