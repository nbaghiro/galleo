import type { Component } from "solid-js";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Template, TemplateEntry } from "@model/templates";
import { TEMPLATE_INDEX } from "@model/templates";
import { Eyebrow } from "@ui/button";
import { api } from "@app/api";
import { appTheme } from "@app/stores/theme";
import { reportError } from "@app/stores/errors";
import { closeGenerate } from "@app/stores/generate";
import { templatesOnce, templateUsesOnce } from "@app/stores/templates";
import { SectionThumb } from "@app/components/previews";
import { TemplatePreview } from "@app/components/TemplatePreview";
import { asFormat } from "@model/analytics";
import { capture } from "@ui/analytics";

// The intake's second exit: the whole catalog, most-used first — popularity is measured across
// all users (the visits table), not curated. Bodies load once for thumbnails and creation.
export const TemplateRow: Component<{
    onBrowseAll: () => void;
    onShape: (t: Template) => void;
}> = (props) => {
    const navigate = useNavigate();
    const [bodies, setBodies] = createSignal<Map<string, Template>>(new Map());
    const [uses, setUses] = createSignal<Record<string, number>>({});
    const [using, setUsing] = createSignal<string | null>(null);
    const [preview, setPreview] = createSignal<Template | null>(null);

    onMount(() => {
        void templatesOnce()
            .then((all) => setBodies(new Map(all.map((t) => [t.id, t]))))
            .catch(() => {
                /* cards fall back to type-only; creation needs the body, so clicks no-op */
            });
        void templateUsesOnce()
            .then(setUses)
            .catch(() => {
                /* unranked catalog order is a fine fallback */
            });
    });

    // stable sort: ties (and a fresh install with no data) keep the hand-picked catalog order
    const ordered = createMemo(() =>
        [...TEMPLATE_INDEX].sort((a, b) => (uses()[b.id] ?? 0) - (uses()[a.id] ?? 0)),
    );

    // the strip windows the whole catalog: more revealed as you scroll toward the end
    const BATCH = 8;
    const [visible, setVisible] = createSignal(BATCH);
    const shown = createMemo(() => ordered().slice(0, visible()));
    let strip: HTMLDivElement | undefined;
    let sentinel: HTMLDivElement | undefined;
    onMount(() => {
        const io = new IntersectionObserver(
            (hits) => {
                if (hits.some((h) => h.isIntersecting))
                    setVisible((v) => Math.min(v + BATCH, TEMPLATE_INDEX.length));
            },
            // the strip is the scrollport; start loading a couple of cards before the edge
            { root: strip, rootMargin: "0px 400px 0px 0px" },
        );
        if (sentinel) io.observe(sentinel);
        onCleanup(() => io.disconnect());
    });

    const open = (entry: TemplateEntry): void => {
        const t = bodies().get(entry.id);
        if (!t) return; // no body yet: the card is still a placeholder
        setPreview(t);
        capture("template_previewed", {
            template_id: t.id,
            category: t.category,
            format: asFormat(t.content.format),
        });
    };

    const use = async (t: Template, fmt: string): Promise<void> => {
        if (using()) return;
        setUsing(t.id);
        try {
            // the format the preview settled on; the user's app theme, not the template's saved one
            const { id } = await api.createArtifact({
                title: t.name,
                formatId: fmt,
                themeId: appTheme(),
                draftContent: { ...t.content, format: fmt, theme: appTheme() },
                templateId: t.id,
            });
            closeGenerate();
            navigate(`/edit/${id}`);
        } catch (e) {
            setUsing(null);
            reportError(e, "Couldn’t start from that template");
        }
    };

    return (
        <>
            <div class="mt-8 w-full">
                <div class="mb-1 flex items-center gap-2 px-1">
                    <Eyebrow as="span" weight="normal" tracking="widest" class="flex-none">
                        Popular templates
                    </Eyebrow>
                    <span class="h-px flex-1 bg-line" />
                    <button
                        class="flex-none text-[11.5px] font-semibold text-accent transition-colors hover:text-ink"
                        onClick={() => props.onBrowseAll()}
                    >
                        Browse all {TEMPLATE_INDEX.length} →
                    </button>
                </div>
                <div
                    ref={strip}
                    class="no-scrollbar -mx-1 flex gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 pt-1.5"
                >
                    <For each={shown()}>
                        {(entry) => {
                            const body = (): Template | undefined => bodies().get(entry.id);
                            const cover = () => body()?.content.sections[0];
                            return (
                                <div
                                    class="w-42 flex-none transition-opacity"
                                    classList={{ "opacity-60": using() === entry.id }}
                                >
                                    <Show
                                        when={cover()}
                                        fallback={
                                            <div class="flex aspect-video w-full flex-col justify-end rounded-lg border border-line bg-panel p-2.5">
                                                <span class="line-clamp-3 text-[11px] leading-snug text-muted">
                                                    {entry.description}
                                                </span>
                                            </div>
                                        }
                                    >
                                        <SectionThumb
                                            section={cover()!}
                                            themeId={appTheme()}
                                            formatId={body()!.content.format}
                                            width={168}
                                            tile={16 / 9}
                                            label={entry.name}
                                            onOpen={() => open(entry)}
                                        />
                                    </Show>
                                    <button
                                        class="mt-1.5 block w-full text-left"
                                        disabled={using() !== null}
                                        onClick={() => open(entry)}
                                    >
                                        <span class="block truncate text-[12px] font-semibold text-ink">
                                            {using() === entry.id ? "Creating…" : entry.name}
                                        </span>
                                        <span class="block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                                            {entry.category}
                                        </span>
                                    </button>
                                </div>
                            );
                        }}
                    </For>
                    {/* zero-width probe: nearing it pulls the next window in */}
                    <div ref={sentinel} class="w-px flex-none self-stretch" aria-hidden="true" />
                </div>
            </div>
            <Show when={preview()}>
                {(t) => (
                    <TemplatePreview
                        template={t()}
                        busy={using() === t().id}
                        onBack={() => setPreview(null)}
                        onClose={() => setPreview(null)}
                        onUse={(fmt) => void use(t(), fmt)}
                        onShape={() => {
                            // read before closing: `t` is the Show's own accessor, and it is stale
                            // the moment the preview it belongs to is dismissed
                            const picked = t();
                            setPreview(null);
                            props.onShape(picked);
                        }}
                    />
                )}
            </Show>
        </>
    );
};
