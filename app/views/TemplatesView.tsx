import type { Component } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { api, type ApiTemplate } from "../api";
import { FORMATS, formatLabel } from "../stores/library";
import { CloseIcon } from "@ui/icons";
import { Button, Eyebrow, IconButton } from "@ui/button";
import { Segmented } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { PreviewCanvas, SectionThumb } from "../components/previews";
import { Sidebar } from "../components/Sidebar";
import { appTheme } from "../theme";

export const TemplatesView: Component = () => {
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
        (async () => {
            try {
                const res = await api.listTemplates();
                setTemplates(res.templates);
            } finally {
                setLoading(false);
            }
        })();
    });

    const categories = createMemo(() => [...new Set(templates().map((t) => t.category))]);
    const inCategory = (cat: string): ApiTemplate[] =>
        templates().filter((t) => t.category === cat);

    const use = async (t: ApiTemplate): Promise<void> => {
        if (using()) return;
        setUsing(t.id);
        try {
            // honor the format chosen in the preview (deck/doc/web) and the user's current app theme,
            // not the template's saved ones — set both on the artifact record + the content the editor reads.
            const fmt = previewFmt();
            const content = { ...t.content, format: fmt, theme: appTheme() };
            const { id } = await api.createArtifact({
                title: t.name,
                formatId: fmt,
                themeId: appTheme(),
                draftContent: content,
            });
            navigate(`/edit/${id}`);
        } catch {
            setUsing(null);
        }
    };

    const Card: Component<{ t: ApiTemplate }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] => resolveTheme(appTheme()).tokens;
        const cover = () => p.t.content.sections[0];
        return (
            <div class="flex w-[244px] flex-none flex-col">
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
        <div class="flex h-full">
            <Sidebar />
            <main class="flex-1 overflow-y-auto bg-canvas">
                <div class="border-b border-line px-9 py-7">
                    <Eyebrow tracking="widest" as="div">
                        Start from a template
                    </Eyebrow>
                    <h1 class="mt-1 font-display text-[26px] font-semibold text-ink">Templates</h1>
                    <p class="mt-1 text-[13px] text-muted">
                        Beautiful, ready-to-edit starting points — pick one and make it yours.
                    </p>
                </div>
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
                                <div class="mb-4 flex items-baseline gap-3 px-9">
                                    <h2 class="text-[15px] font-semibold text-ink">{cat}</h2>
                                    <span class="font-mono text-[11px] text-muted">
                                        {inCategory(cat).length}
                                    </span>
                                </div>
                                <div class="no-scrollbar flex gap-5 overflow-x-auto px-9 pb-2">
                                    <For each={inCategory(cat)}>{(t) => <Card t={t} />}</For>
                                </div>
                            </section>
                        )}
                    </For>
                </Show>
            </main>

            {/* preview modal — renders the template read-only with format switches, then "Use template" */}
            <Show when={preview()}>
                {(t) => (
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
                                    options={FORMATS.map((f) => ({ label: f.label, value: f.id }))}
                                    onChange={setPreviewFmt}
                                />
                            </div>
                            <div class="ml-auto flex items-center gap-2">
                                <Button
                                    variant="primary"
                                    disabled={using() !== null}
                                    onClick={() => use(t())}
                                >
                                    {using() === t().id ? "Creating…" : "Use template →"}
                                </Button>
                                <IconButton
                                    size="xl"
                                    title="Close"
                                    onClick={() => setPreview(null)}
                                >
                                    <CloseIcon size={16} />
                                </IconButton>
                            </div>
                        </header>
                        <div class="min-h-0 flex-1">
                            <PreviewCanvas
                                content={{ ...t().content, theme: appTheme() }}
                                format={previewFmt}
                            />
                        </div>
                    </Modal>
                )}
            </Show>
        </div>
    );
};
