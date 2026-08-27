import type { Component } from "solid-js";
import type { Section } from "@model/artifact";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { api, type ApiTemplate } from "@app/api";
import { asFormat } from "@model/analytics";
import { capture } from "@ui/analytics";
import { formatLabel } from "@app/stores/library";
import { SectionThumb } from "./previews";
import { TemplatePreview } from "./TemplatePreview";
import { appTheme } from "@app/stores/theme";
import { templatesOnce } from "@app/stores/templates";

// every card in the catalog is this shape, whatever the cover section's own frame is
const CARD_ASPECT = 16 / 9;

// The template gallery — category rows, live-preview modal, and the use action — shared by the
// Templates page and the intake's in-place browser. `onCreated` runs before the navigate, so a
// host inside the studio can close itself.
export const TemplateGallery: Component<{
    onCreated?: () => void;
    from?: string;
    /** Offered where a run is being set up: borrow this starter's shapes instead of starting from it. */
    onShape?: (t: ApiTemplate) => void;
}> = (props) => {
    const navigate = useNavigate();
    const [templates, setTemplates] = createSignal<ApiTemplate[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [using, setUsing] = createSignal<string | null>(null);
    const [preview, setPreview] = createSignal<ApiTemplate | null>(null);
    const openPreview = (t: ApiTemplate): void => {
        setPreview(t);
        capture("template_previewed", {
            template_id: t.id,
            category: t.category,
            format: asFormat(t.content.format),
        });
    };

    onMount(() => {
        void templatesOnce()
            .then(setTemplates)
            .finally(() => setLoading(false));
    });

    const categories = createMemo(() => [...new Set(templates().map((t) => t.category))]);
    const inCategory = (cat: string): ApiTemplate[] =>
        templates().filter((t) => t.category === cat);

    const use = async (t: ApiTemplate, fmt: string): Promise<void> => {
        if (using()) return;
        setUsing(t.id);
        try {
            // the format the preview settled on + the user's app theme, not the template's saved ones
            const content = { ...t.content, format: fmt, theme: appTheme() };
            const { id } = await api.createArtifact({
                title: t.name,
                formatId: fmt,
                themeId: appTheme(),
                draftContent: content,
                templateId: t.id,
            });
            capture("artifact_created", {
                source: "template",
                format: asFormat(fmt),
                template_id: t.id,
            });
            capture("template_used", {
                template_id: t.id,
                category: t.category,
                format: asFormat(fmt),
                from: props.from ?? "templates",
            });
            props.onCreated?.();
            navigate(`/edit/${id}`);
        } catch {
            setUsing(null);
        }
    };

    const Card: Component<{ t: ApiTemplate }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] => resolveTheme(appTheme()).tokens;
        // first unpinned section (a pinned nav is chrome); `tile` below is what makes every card
        // 16:9 whatever shape that section carries
        const cover = (): Section | undefined =>
            p.t.content.sections.find((s) => !s.pinned) ?? p.t.content.sections[0];
        return (
            <div class="flex w-61 flex-none flex-col">
                <div class="group relative">
                    <Show when={cover()}>
                        <SectionThumb
                            section={cover()!}
                            themeId={appTheme()}
                            formatId={p.t.content.format}
                            width={244}
                            tile={CARD_ASPECT}
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
                            {/* the inset is the wrapper's, not the scroller's: a scroll container
                                clips at its padding box, so content paints through its own
                                padding-right and the row would run flush into the modal edge */}
                            <div class="px-5 md:px-9">
                                <div class="no-scrollbar flex gap-5 overflow-x-auto overscroll-x-contain pb-2">
                                    <For each={inCategory(cat)}>{(t) => <Card t={t} />}</For>
                                </div>
                            </div>
                        </section>
                    )}
                </For>
            </Show>

            <Show when={preview()}>
                {(t) => (
                    <TemplatePreview
                        template={t()}
                        busy={using() === t().id}
                        // the Templates page is its own destination and needs no way back; a
                        // gallery hosted inside a flow names itself, and does
                        onBack={props.from ? () => setPreview(null) : undefined}
                        onClose={() => setPreview(null)}
                        onUse={(fmt) => void use(t(), fmt)}
                        onShape={props.onShape ? () => props.onShape?.(t()) : undefined}
                    />
                )}
            </Show>
        </>
    );
};
