import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import type { Beat } from "@model/ai";
import { Button, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { Dropdown } from "@ui/select";
import { Credits } from "../../components/credits";
import { blocksForLayout, LAYOUT_IDS } from "../../stores/generate-plan";
import {
    addBeatAfter,
    buildSectionNow,
    gen,
    moveBeatDir,
    patchBeat,
    removeBeatById,
    sectionCost,
} from "../../stores/generate";
import { BEAT_ROLES, LAYOUT_LABELS, previewFormat } from "./shared";
import { BlueprintThumb } from "../../components/previews";
import { Field, Inline, Tag } from "./inline";

// A planned beat, in the canvas at the width of the section it becomes: everything the writer will
// work from, editable in place. Writing it swaps this card for the painted section.

export const OutlineCard: Component<{
    beat: Beat;
    index: number;
    total: number;
    open: boolean;
    draggable: boolean;
    onGrip: () => void;
    onToggle: () => void;
}> = (props) => {
    const patch = (p: Partial<Beat>): void => patchBeat(props.beat.id, p);
    const points = (): string[] => props.beat.points ?? [];
    const covers = (): string[] => props.beat.covers ?? [];
    const busy = (): boolean => !!gen.activeSection;

    const setPoint = (i: number, v: string): void => {
        const next = [...points()];
        next[i] = v;
        patch({ points: next });
    };

    return (
        <div class="flex flex-col gap-2 rounded-[var(--radius)] border border-line bg-panel p-4">
            <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] text-muted">
                    {String(props.index + 1).padStart(2, "0")}
                </span>
                <Tag>{props.beat.role}</Tag>
                <Show when={props.beat.image}>
                    <Tag tone="accent">image</Tag>
                </Show>
                <div class="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton
                        size="sm"
                        tone="muted"
                        title="Move up"
                        disabled={props.index === 0}
                        onClick={() => moveBeatDir(props.beat.id, -1)}
                    >
                        <Icon name="chevronUp" size={12} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        tone="muted"
                        title="Move down"
                        disabled={props.index === props.total - 1}
                        onClick={() => moveBeatDir(props.beat.id, 1)}
                    >
                        <Icon name="chevronDown" size={12} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        tone="muted"
                        title="Add a section after this one"
                        onClick={() => addBeatAfter(props.beat.id)}
                    >
                        <Icon name="plus" size={12} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        tone="muted"
                        title="Remove this section"
                        onClick={() => removeBeatById(props.beat.id)}
                    >
                        <Icon name="trash" size={11} />
                    </IconButton>
                </div>
            </div>

            <div class="flex items-start gap-4">
                <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <Inline
                        ariaLabel="Section title"
                        class="font-serif text-[21px] leading-tight"
                        placeholder="Untitled section"
                        value={props.beat.label}
                        onChange={(v) => patch({ label: v })}
                    />

                    <Inline
                        ariaLabel="Takeaway"
                        class="text-[13.5px] leading-relaxed text-soft"
                        placeholder="The one thing the reader leaves with…"
                        value={props.beat.takeaway ?? ""}
                        onChange={(v) => patch({ takeaway: v })}
                    />
                </div>

                {/* the engine's own skeleton, so changing the layout or the image flag is something
                    you SEE rather than read off a dropdown */}
                <BlueprintThumb
                    class="mt-0.5 flex-none"
                    id={props.beat.id}
                    layout={props.beat.layout ?? "full"}
                    blocks={props.beat.blocks ?? []}
                    image={props.beat.image ?? false}
                    themeId={gen.content.theme}
                    formatId={previewFormat()}
                />
            </div>

            <ul class="flex flex-col gap-0.5">
                <For each={points()}>
                    {(point, i) => (
                        <li class="group/pt flex items-start gap-2">
                            <span class="mt-2 size-1 flex-none rounded-full bg-accent/60" />
                            <Inline
                                ariaLabel={`Point ${i() + 1}`}
                                class="text-[12.5px] leading-relaxed"
                                placeholder="What this section actually says…"
                                value={point}
                                onChange={(v) => setPoint(i(), v)}
                            />
                            <IconButton
                                size="2xs"
                                tone="muted"
                                class="mt-1 opacity-0 transition-opacity group-hover/pt:opacity-100"
                                title="Remove this point"
                                onClick={() =>
                                    patch({ points: points().filter((_, j) => j !== i()) })
                                }
                            >
                                <Icon name="close" size={10} />
                            </IconButton>
                        </li>
                    )}
                </For>
                <li>
                    <button
                        class="flex items-center gap-1 py-0.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                        onClick={() => patch({ points: [...points(), ""] })}
                    >
                        <Icon name="plus" size={11} /> Add a point
                    </button>
                </li>
            </ul>

            <Show when={covers().length}>
                <div class="flex flex-wrap gap-1">
                    <For each={covers()}>{(c) => <Tag tone="accent">{c}</Tag>}</For>
                </div>
            </Show>

            <div class="flex items-center gap-1.5 border-t border-line pt-2.5">
                <Button
                    variant="primary"
                    size="sm"
                    disabled={busy()}
                    onClick={() => void buildSectionNow(props.beat.id)}
                >
                    <Icon name="sparkle" size={12} /> Write this one · <Credits n={sectionCost()} />
                </Button>
                <button
                    class="text-[11.5px] text-muted transition-colors hover:text-ink"
                    onClick={() => props.onToggle()}
                >
                    {props.open ? "Fewer details" : "More details"}
                </button>
            </div>

            {/* the structural knobs: real, but not what you read an outline for */}
            <Show when={props.open}>
                <div class="flex flex-col gap-2.5 border-t border-line pt-2.5">
                    <Field label="What it must say">
                        <Inline
                            ariaLabel="Section brief"
                            class="text-[12.5px] leading-relaxed"
                            placeholder="One line telling the writer this section's job…"
                            value={props.beat.brief ?? ""}
                            onChange={(v) => patch({ brief: v })}
                        />
                    </Field>
                    <div class="flex flex-wrap items-end gap-3">
                        <div class="w-36">
                            <Field label="Layout">
                                <Dropdown
                                    compact
                                    value={props.beat.layout ?? "full"}
                                    options={LAYOUT_IDS.map((id) => ({
                                        value: id,
                                        label: LAYOUT_LABELS[id] ?? id,
                                    }))}
                                    onChange={(layout) =>
                                        patch({
                                            layout,
                                            blocks: blocksForLayout(layout, props.beat.blocks),
                                        })
                                    }
                                />
                            </Field>
                        </div>
                        <div class="w-32">
                            <Field label="Role">
                                <Dropdown
                                    compact
                                    value={props.beat.role}
                                    options={BEAT_ROLES.map((r) => ({ value: r, label: r }))}
                                    onChange={(role) => patch({ role })}
                                />
                            </Field>
                        </div>
                        <Button
                            variant={props.beat.image ? "outline" : "ghost"}
                            size="sm"
                            onClick={() => patch({ image: !props.beat.image })}
                        >
                            <Icon name="media" size={12} />
                            {props.beat.image ? "Leads with an image" : "No lead image"}
                        </Button>
                    </div>
                </div>
            </Show>
        </div>
    );
};
