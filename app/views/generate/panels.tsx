import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { Button, Chip, Eyebrow, Spinner } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import {
    answerClarify,
    briefCost,
    coverage,
    gen,
    redraftBrief,
    setBriefField,
    setGen,
    setMustInclude,
} from "../../stores/generate";
import { Credits } from "../../components/credits";

// Reading the brief is optional enrichment, not a gate: the fields start empty and the arc is
// planned from the prompt, but pulling a read fills them in and sharpens every later section.

const FIELDS = [
    ["Goal", "goal", "what it has to achieve"],
    ["Audience", "audience", "who it's aimed at"],
    ["Tone", "tone", "how it should sound"],
] as const;

// The read, as a sentence rather than four inputs — it's meant to be checked at a glance, and it's
// the one part of the brief the model wrote rather than the user.
const ReadLine: Component = () => (
    <p class="text-[13px] leading-relaxed text-soft">
        A <Val v={gen.brief.tone} fallback="clear" /> {gen.brief.surface} for{" "}
        <Val v={gen.brief.audience} fallback="a general audience" />, meant to{" "}
        <Val v={gen.brief.goal} fallback="land its point" />.
    </p>
);

const Val: Component<{ v?: string; fallback: string }> = (props) => (
    <span classList={{ "text-accent": !!props.v, "text-muted": !props.v }}>
        {props.v ?? props.fallback}
    </span>
);

const BriefFields: Component = () => {
    const [point, setPoint] = createSignal("");
    const points = (): string[] => gen.brief.mustInclude ?? [];
    const read = (): boolean => !!(gen.brief.goal || gen.brief.audience || gen.brief.tone);
    const addPoint = (): void => {
        const p = point().trim();
        if (!p) return;
        setPoint("");
        setMustInclude([...points(), p]);
    };
    const covered = (): Map<string, string[]> => coverage();

    return (
        <div class="flex flex-col gap-3 pb-3 pt-2">
            <Show when={gen.clarify}>
                <ClarifyBox />
            </Show>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Show
                    when={read()}
                    fallback={
                        <p class="text-[13px] leading-relaxed text-muted">
                            Planning straight from your prompt. Read it to pull out the goal,
                            audience and tone, so every section aims at the same thing.
                        </p>
                    }
                >
                    <ReadLine />
                </Show>
                <Button
                    variant="outline"
                    size="sm"
                    class="ml-auto flex-none whitespace-nowrap"
                    disabled={gen.briefLoading}
                    onClick={() => void redraftBrief()}
                >
                    <Show when={!gen.briefLoading} fallback="Reading…">
                        <Icon name="refresh" size={12} />
                        {read() ? "Read it again" : "Read the brief"} · <Credits n={briefCost()} />
                    </Show>
                </Button>
            </div>

            {/* laid across the width rather than stacked in a column — the band sits under a
                full-width header, and a narrow form pinned left reads as an orphan */}
            <div class="flex flex-wrap gap-x-5 gap-y-3">
                <div class="min-w-72 flex-[2]">
                    <Eyebrow as="div" weight="normal" tracking="widest" class="mb-1">
                        The prompt
                    </Eyebrow>
                    <TextArea
                        rows={2}
                        rounded="md"
                        value={gen.brief.prompt}
                        onChange={(v) => setBriefField("prompt", v)}
                    />
                </div>
                <For each={FIELDS}>
                    {([label, key, hint]) => (
                        <div class="min-w-44 flex-1">
                            <Eyebrow as="div" weight="normal" tracking="widest" class="mb-1">
                                {label}
                            </Eyebrow>
                            <TextField
                                compact
                                value={gen.brief[key] ?? ""}
                                placeholder={gen.briefLoading ? "reading…" : hint}
                                onChange={(v) => setBriefField(key, v)}
                            />
                        </div>
                    )}
                </For>
            </div>

            <div>
                <Eyebrow as="div" weight="normal" tracking="widest" class="mb-1">
                    Must cover
                </Eyebrow>
                <div class="flex flex-wrap items-center gap-1.5">
                    <For each={points()}>
                        {(p, i) => (
                            <Chip
                                variant="outline"
                                size="sm"
                                rounded="md"
                                class="max-w-full"
                                title={
                                    (covered().get(p)?.length ?? 0) > 0
                                        ? "A section covers this"
                                        : "No section covers this yet"
                                }
                                selected={(covered().get(p)?.length ?? 0) > 0}
                                onRemove={() =>
                                    setMustInclude(points().filter((_, j) => j !== i()))
                                }
                            >
                                <span class="truncate">{p}</span>
                            </Chip>
                        )}
                    </For>
                    <TextField
                        compact
                        class="min-w-52 flex-1"
                        value={point()}
                        placeholder="Add a point the piece has to cover — Enter"
                        onChange={setPoint}
                        onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && addPoint()}
                    />
                </div>
            </div>

            <Show when={(gen.brief.clarifications ?? []).length}>
                <div class="flex flex-wrap gap-x-4 gap-y-0.5">
                    <For each={gen.brief.clarifications}>
                        {(c) => (
                            <p class="text-[11px] leading-snug text-muted">
                                <Icon name="check" size={10} /> {c}
                            </p>
                        )}
                    </For>
                </div>
            </Show>
            <Show when={gen.briefFailed}>
                <p class="text-[11px] leading-snug text-muted">
                    That read didn't come back — the arc still plans from your prompt.
                </p>
            </Show>
            <Show when={gen.briefDirty}>
                <p class="text-[11px] leading-snug text-accent">
                    The plan was made against an older brief — reroll it to match.
                </p>
            </Show>
        </div>
    );
};

// The one clarifying question, with a way to actually answer it. Yes/No cover the common shape;
// anything subtler goes in the field. Either way the answer lands in the brief.
const ClarifyBox: Component = () => {
    const [reply, setReply] = createSignal("");
    const send = (text: string): void => {
        answerClarify(text);
        setReply("");
    };
    return (
        <div class="rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p class="text-[12.5px] leading-snug text-ink">{gen.clarify}</p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip variant="solid" size="md" rounded="md" selected onClick={() => send("Yes")}>
                    Yes
                </Chip>
                <Chip variant="outline" size="md" rounded="md" onClick={() => send("No")}>
                    No
                </Chip>
                <TextField
                    compact
                    class="min-w-40 flex-1"
                    placeholder="…or answer in your own words"
                    value={reply()}
                    onChange={setReply}
                    onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && send(reply())}
                />
                <button
                    class="text-[11.5px] text-muted transition-colors hover:text-ink"
                    title="Leave it unanswered"
                    onClick={() => setGen("clarify", null)}
                >
                    Skip
                </button>
            </div>
        </div>
    );
};

// The brief is what the plan is judged against, so it stays reachable for the whole run — one line
// across the top, opening into the editable fields.
export const BriefBar: Component = () => {
    const [open, setOpen] = createSignal(false);
    const read = (): string | null => {
        const { tone, audience, goal, surface } = gen.brief;
        if (!tone && !audience && !goal) return null;
        return `A ${tone ?? "clear"} ${surface} for ${audience ?? "a general audience"}, meant to ${goal ?? "land its point"}.`;
    };
    const points = (): string[] => gen.brief.mustInclude ?? [];

    return (
        <div class="flex-none border-b border-line bg-panel px-4 py-1.5">
            <button
                class="flex w-full items-center gap-2 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <Eyebrow weight="normal" tracking="widest">
                    Brief
                </Eyebrow>
                <span class="min-w-0 flex-1 truncate text-[11.5px] text-soft">
                    {read() ?? gen.brief.prompt}
                </span>
                <Show when={points().length}>
                    <span class="flex-none font-mono text-[9.5px] uppercase tracking-wide text-muted">
                        {points().length} must-cover
                    </span>
                </Show>
                <Show when={gen.briefDirty}>
                    <span class="flex-none font-mono text-[9.5px] uppercase tracking-wide text-accent">
                        edited
                    </span>
                </Show>
                <span class="flex flex-none items-center gap-1 text-muted">
                    <Show when={gen.briefLoading}>
                        <Spinner size={10} />
                    </Show>
                    <Icon name={open() ? "chevronUp" : "chevronDown"} size={12} />
                </span>
            </button>
            <Show when={open()}>
                <BriefFields />
            </Show>
        </div>
    );
};
