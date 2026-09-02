import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ArtifactSummary, SectionSummary } from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import type { Template } from "@model/templates";
import { Eyebrow, IconButton, Spinner } from "@ui/button";
import { CONTROL_H, TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { SectionThumb } from "@app/components/previews";
import {
    artifacts,
    cardSection,
    ensureCardSections,
    ensureLibrary,
    formatLabel,
    loadLibrary,
} from "@app/stores/library";
import { templatesOnce } from "@app/stores/templates";
import { importFile } from "@app/stores/import";
import { reportError } from "@app/stores/errors";

// Everything that can answer "what should this look like", in one place: a PowerPoint template read
// for its designs, a deck of the reader's own, or one of ours. A design lends its arrangement and
// its theme; what the piece SAYS comes from the prompt and whatever is attached to it.

/** A shape a run follows: its designs and its theme travel, none of its words. */
export interface PickedShape {
    id: string;
    name: string;
    category: string;
    format: string;
    sections: number;
    themeId?: string;
}

const CARD_ASPECT = 16 / 9;
const CARD_MIN = 220; // narrowest a card gets before a band drops a column
const CARD_GAP = 20;
const INSET = "px-5 md:px-9";

const Card: Component<{
    name: string;
    format: string;
    designs: number;
    selected: boolean;
    children: JSX.Element;
}> = (props) => (
    <div class="min-w-0">
        {props.children}
        <div class="mt-2.5 flex items-center gap-2">
            <Eyebrow as="span" size={9} class="text-accent">
                {formatLabel(props.format)}
            </Eyebrow>
            <span class="text-[10px] text-muted">· {props.designs} designs</span>
        </div>
        <div
            class="mt-0.5 truncate text-[14px] font-semibold"
            classList={{ "text-accent": props.selected, "text-ink": !props.selected }}
        >
            {props.name}
        </div>
    </div>
);

/** One labelled band, the shape the template gallery already uses for a category. */
const Band: Component<{ title: string; count?: number; cols: number; children: JSX.Element }> = (
    props,
) => (
    <section class="border-b border-line py-6">
        <div class={`mb-4 flex items-baseline gap-3 ${INSET}`}>
            <h2 class="text-[15px] font-semibold text-ink">{props.title}</h2>
            <Show when={props.count !== undefined}>
                <span class="font-mono text-[11px] text-muted">{props.count}</span>
            </Show>
        </div>
        <div class={INSET}>
            <div
                class="grid"
                style={{
                    "grid-template-columns": `repeat(${props.cols}, minmax(0, 1fr))`,
                    gap: `${CARD_GAP}px`,
                }}
            >
                {props.children}
            </div>
        </div>
    </section>
);

// A design is shown in ITS OWN theme, not the app's: picking it adopts that palette, so the card
// has to be the thing the reader is choosing.
const YourCard: Component<{
    art: ArtifactSummary;
    width: number;
    selected: boolean;
    onPick: () => void;
}> = (props) => {
    const cover = (): SectionSummary | undefined => props.art.sections?.[0];
    const coverId = (): string => cover()?.id ?? "";
    onMount(() => {
        if (coverId()) void ensureCardSections(props.art.id, [coverId()]);
    });
    const loaded = () => (coverId() ? cardSection(props.art.id, coverId()) : undefined);
    return (
        <Card
            name={props.art.title}
            format={props.art.formatId}
            designs={props.art.sections?.length ?? 0}
            selected={props.selected}
        >
            <SectionThumb
                section={loaded() ?? { id: coverId() || "s1", root: emptyRegion() }}
                ghost={loaded() ? undefined : cover()}
                themeId={props.art.themeId}
                formatId={props.art.formatId}
                page={props.art.page}
                label={props.art.title}
                width={props.width}
                tile={CARD_ASPECT}
                selected={props.selected}
                onOpen={props.onPick}
            />
        </Card>
    );
};

const TemplateCard: Component<{
    template: Template;
    width: number;
    selected: boolean;
    onPick: () => void;
}> = (props) => (
    <Card
        name={props.template.name}
        format={props.template.content.format}
        designs={props.template.content.sections.length}
        selected={props.selected}
    >
        <SectionThumb
            section={props.template.content.sections[0] ?? { id: "s1", root: emptyRegion() }}
            themeId={props.template.content.theme}
            formatId={props.template.content.format}
            label={props.template.name}
            width={props.width}
            tile={CARD_ASPECT}
            selected={props.selected}
            onOpen={props.onPick}
        />
    </Card>
);

export const DesignPane: Component<{
    onBack: () => void;
    picked?: string;
    onPick: (shape: PickedShape) => void;
}> = (props) => {
    const [templates, setTemplates] = createSignal<Template[] | null>(null);
    const [q, setQ] = createSignal("");
    const [reading, setReading] = createSignal(false);
    const [dropping, setDropping] = createSignal(false);
    let fileInput: HTMLInputElement | undefined;

    // a scaled canvas needs a pixel width, so the column width is computed from the measured band
    // rather than left to the browser's auto-fill (the library grid's own pattern)
    const [gridW, setGridW] = createSignal(0);
    let ro: ResizeObserver | undefined;
    const measureBand = (el: HTMLElement): void => {
        ro?.disconnect();
        ro = new ResizeObserver((es) => setGridW(es[0]?.contentRect.width ?? el.clientWidth));
        ro.observe(el);
    };
    onCleanup(() => ro?.disconnect());
    const cols = (): number =>
        Math.max(2, Math.floor((gridW() + CARD_GAP) / (CARD_MIN + CARD_GAP)));
    const cardW = (): number =>
        gridW() ? Math.floor((gridW() - CARD_GAP * (cols() - 1)) / cols()) : 0;

    onMount(() => {
        void ensureLibrary();
        void templatesOnce()
            .then(setTemplates)
            .catch(() => setTemplates([]));
    });

    const match = (title: string): boolean => {
        const needle = q().trim().toLowerCase();
        return !needle || title.toLowerCase().includes(needle);
    };
    // a piece with no sections has no design to lend
    const yours = createMemo(() =>
        artifacts().filter((a) => !a.trashedAt && (a.sections?.length ?? 0) > 0 && match(a.title)),
    );
    const theirs = createMemo(() => (templates() ?? []).filter((t) => match(t.name)));

    const read = async (file: File | undefined): Promise<void> => {
        if (!file || reading()) return;
        setReading(true);
        try {
            const id = await importFile(file, undefined, "designs");
            await loadLibrary();
            const made = artifacts().find((a) => a.id === id);
            if (made)
                props.onPick({
                    id: made.id,
                    name: made.title,
                    category: "upload",
                    format: made.formatId,
                    sections: made.sections?.length ?? 0,
                    themeId: made.themeId,
                });
        } catch (e) {
            reportError(e, "Couldn't read that template");
        } finally {
            setReading(false);
        }
    };

    return (
        <div class="flex h-full flex-col">
            <div class="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
                <IconButton size="sm" tone="muted" title="Back" onClick={() => props.onBack()}>
                    <Icon name="chevronLeft" size={14} />
                </IconButton>
                <div class="flex items-baseline gap-2">
                    <span class="text-[13.5px] font-semibold tracking-tight">Design</span>
                    <span class="font-mono text-[10px] text-muted">
                        what this piece should look like
                    </span>
                </div>
                <TextField
                    icon="search"
                    class={`ml-auto w-56 max-w-[45%] ${CONTROL_H}`}
                    placeholder="Find a design…"
                    value={q()}
                    onChange={setQ}
                />
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">
                <div ref={measureBand} class={`border-b border-line py-6 ${INSET}`}>
                    <button
                        class="flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left transition-colors"
                        classList={{
                            "border-accent bg-accent/6": dropping(),
                            "border-line hover:border-accent": !dropping(),
                        }}
                        disabled={reading()}
                        onClick={() => fileInput?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDropping(true);
                        }}
                        onDragLeave={() => setDropping(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDropping(false);
                            void read(e.dataTransfer?.files?.[0]);
                        }}
                    >
                        <Show when={!reading()} fallback={<Spinner size={16} />}>
                            <Icon name="layers" size={16} />
                        </Show>
                        <span class="min-w-0 flex-1">
                            <span class="block text-[13px] font-semibold">
                                {reading()
                                    ? "Reading the template…"
                                    : "Drop a PowerPoint template, or pick a file"}
                            </span>
                            <span class="mt-0.5 block text-[11.5px] leading-snug text-muted">
                                Its colours, type pairing and slide designs come across. The words
                                are written fresh from your brief.
                            </span>
                        </span>
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".pptx"
                        class="hidden"
                        onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            void read(file);
                        }}
                    />
                </div>

                <Show when={cardW() > 0 && yours().length}>
                    <Band title="Yours" count={yours().length} cols={cols()}>
                        <For each={yours()}>
                            {(art) => (
                                <YourCard
                                    art={art}
                                    width={cardW()}
                                    selected={props.picked === art.id}
                                    onPick={() =>
                                        props.onPick({
                                            id: art.id,
                                            name: art.title,
                                            category: "yours",
                                            format: art.formatId,
                                            sections: art.sections?.length ?? 0,
                                            themeId: art.themeId,
                                        })
                                    }
                                />
                            )}
                        </For>
                    </Band>
                </Show>

                <Show
                    when={cardW() > 0 && templates()}
                    fallback={
                        <div class="flex h-24 items-center justify-center">
                            <Spinner size={16} />
                        </div>
                    }
                >
                    <Band title="Galleo templates" count={theirs().length} cols={cols()}>
                        <Show
                            when={theirs().length}
                            fallback={<p class="text-[12px] text-muted">Nothing matches.</p>}
                        >
                            <For each={theirs()}>
                                {(template) => (
                                    <TemplateCard
                                        template={template}
                                        width={cardW()}
                                        selected={props.picked === template.id}
                                        onPick={() =>
                                            props.onPick({
                                                id: template.id,
                                                name: template.name,
                                                category: template.category,
                                                format: template.content.format,
                                                sections: template.content.sections.length,
                                            })
                                        }
                                    />
                                )}
                            </For>
                        </Show>
                    </Band>
                </Show>
            </div>
        </div>
    );
};
