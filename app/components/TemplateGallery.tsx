import type { Component } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { api, type ApiTemplate } from "../api";
import { FORMATS, formatLabel } from "../stores/library";
import { Button } from "@ui/button";
import { Segmented } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { PresentSurface } from "@ui/present";
import { canEditHere } from "@ui/viewport";
import { PreviewCanvas, SectionThumb } from "./previews";
import { appTheme } from "../stores/theme";
import { templatesOnce } from "../stores/templates";

// The template gallery — category rows, live-preview modal, and the use action — shared by the
// Templates page and the intake's in-place browser. `onCreated` runs before the navigate, so a
// host inside the studio can close itself.
export const TemplateGallery: Component<{ onCreated?: () => void }> = (props) => {
    const navigate = useNavigate();
    const [templates, setTemplates] = createSignal<ApiTemplate[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [using, setUsing] = createSignal<string | null>(null);
    const [preview, setPreview] = createSignal<ApiTemplate | null>(null);
    const [previewFmt, setPreviewFmt] = createSignal("deck");

    const openPreview = (t: ApiTemplate): void => {
        setPreviewFmt(t.content.format);
        setPreview(t);
    };

    onMount(() => {
        void templatesOnce()
            .then(setTemplates)
            .finally(() => setLoading(false));
    });

    const categories = createMemo(() => [...new Set(templates().map((t) => t.category))]);
    const inCategory = (cat: string): ApiTemplate[] =>
        templates().filter((t) => t.category === cat);

    const use = async (t: ApiTemplate): Promise<void> => {
        if (using()) return;
        setUsing(t.id);
        try {
            // use the preview's format + the user's app theme, not the template's saved ones
            const fmt = previewFmt();
            const content = { ...t.content, format: fmt, theme: appTheme() };
            const { id } = await api.createArtifact({
                title: t.name,
                formatId: fmt,
                themeId: appTheme(),
                draftContent: content,
                templateId: t.id,
            });
            props.onCreated?.();
            navigate(`/edit/${id}`);
        } catch {
            setUsing(null);
        }
    };

    const Card: Component<{ t: ApiTemplate }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] => resolveTheme(appTheme()).tokens;
        const cover = () => p.t.content.sections[0];
        return (
            <div class="flex w-61 flex-none flex-col">
                <div class="group relative">
                    <Show when={cover()}>
                        <SectionThumb
                            section={cover()!}
                            themeId={appTheme()}
                            formatId={p.t.content.format}
                            width={244}
                            label={p.t.name}
                            onOpen={() => openPreview(p.t)}
                        />
                    </Show>
                    <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 opacity-0 transition group-hover:opacity-100">
                        <span class="rounded-lg bg-white px-3.5 py-2 text-[12px] font-bold text-[#1a1a1a]">
                            Preview →
                        </span>
                    </div>
                </div>
                <div class="mt-2.5">
                    <div class="flex items-center gap-2">
                        <span
                            class="font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
                            style={{ color: tk().accent }}
                        >
                            {formatLabel(p.t.content.format)}
                        </span>
                        <span class="text-[10px] text-muted">
                            · {p.t.content.sections.length} sections
                        </span>
                    </div>
                    <div class="mt-0.5 text-[14px] font-semibold text-ink">{p.t.name}</div>
                    <div class="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
                        {p.t.description}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Show
                when={!loading()}
                fallback={
                    <div class="flex h-40 items-center justify-center text-[13px] text-muted">
                        Loading templates…
                    </div>
                }
            >
                <For each={categories()}>
                    {(cat) => (
                        <section class="border-b border-line py-6">
                            <div class="mb-4 flex items-baseline gap-3 px-5 md:px-9">
                                <h2 class="text-[15px] font-semibold text-ink">{cat}</h2>
                                <span class="font-mono text-[11px] text-muted">
                                    {inCategory(cat).length}
                                </span>
                            </div>
                            <div class="no-scrollbar flex gap-5 overflow-x-auto overscroll-x-contain px-5 pb-2 md:px-9">
                                <For each={inCategory(cat)}>{(t) => <Card t={t} />}</For>
                            </div>
                        </section>
                    )}
                </For>
            </Show>

            <Show when={preview()}>
                {(t) => (
                    <Show
                        when={canEditHere()}
                        fallback={
                            <PresentSurface
                                artifact={{
                                    ...t().content,
                                    format: previewFmt(),
                                    theme: appTheme(),
                                }}
                                viewOnly
                                onExit={() => setPreview(null)}
                            >
                                <div class="absolute inset-x-0 top-0 flex flex-col gap-2 bg-black/55 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md">
                                    <div class="flex items-center gap-2">
                                        <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                                            {t().name}
                                        </span>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            rounded="lg"
                                            disabled={using() !== null}
                                            onClick={() => use(t())}
                                        >
                                            {using() === t().id ? "Creating…" : "Use →"}
                                        </Button>
                                    </div>
                                    <Segmented
                                        variant="accent"
                                        value={previewFmt()}
                                        options={FORMATS.map((f) => ({
                                            label: f.label,
                                            value: f.id,
                                        }))}
                                        onChange={setPreviewFmt}
                                    />
                                </div>
                            </PresentSurface>
                        }
                    >
                        <Modal
                            size="full"
                            surface="canvas"
                            scrim="dim"
                            class="flex h-[94vh] w-[97vw] flex-col overflow-hidden"
                            onClose={() => setPreview(null)}
                        >
                            <header class="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
                                <div class="min-w-0">
                                    <div class="truncate text-[14px] font-semibold text-ink">
                                        {t().name}
                                    </div>
                                    <div class="text-[11px] text-muted">
                                        {t().category} · {t().content.sections.length} sections
                                    </div>
                                </div>
                                <div class="ml-4">
                                    <Segmented
                                        variant="accent"
                                        value={previewFmt()}
                                        options={FORMATS.map((f) => ({
                                            label: f.label,
                                            value: f.id,
                                        }))}
                                        onChange={setPreviewFmt}
                                    />
                                </div>
                                <div class="ml-auto flex items-center gap-2 pr-10">
                                    <Button
                                        variant="primary"
                                        disabled={using() !== null}
                                        onClick={() => use(t())}
                                    >
                                        {using() === t().id ? "Creating…" : "Use template →"}
                                    </Button>
                                </div>
                            </header>
                            <div class="min-h-0 flex-1">
                                <PreviewCanvas
                                    content={{ ...t().content, theme: appTheme() }}
                                    format={previewFmt}
                                />
                            </div>
                        </Modal>
                    </Show>
                )}
            </Show>
        </>
    );
};
