import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Surface } from "@model/ai";
import type { Template } from "@model/templates";
import { Eyebrow, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { MiniCanvas } from "@app/components/previews";
import { appTheme } from "@app/stores/theme";
import { chooseFormat, onboardingBusy, startersFor } from "@app/stores/onboarding";

// The one question. It is asked because the answer is used: `format` picks the render profile, filters
// the starters, and becomes the studio default. Each card shows the artifact it will actually open, so
// the choice is not blind and the click honours what was on screen. Nothing here spends credits: the
// starter is a template, and the generation budget belongs to the user's own first brief.

interface Choice {
    value: Surface;
    label: string;
    icon: string;
    blurb: string;
}

const CHOICES: Choice[] = [
    { value: "deck", label: "A deck", icon: "deck", blurb: "Slides you present or send." },
    { value: "doc", label: "A document", icon: "doc", blurb: "Long-form, one reading column." },
    { value: "web", label: "A site", icon: "site", blurb: "A page that scrolls, full width." },
];

const PREVIEW_W = 300;

const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

export const OnboardingView: Component = () => {
    const navigate = useNavigate();
    const [picked, setPicked] = createSignal<Surface | null>(null);
    const [failed, setFailed] = createSignal(false);
    // one starter per format, drawn from that format's most-used, so two people signing up on the
    // same day do not both open the same artifact
    const [pool, setPool] = createSignal<Record<string, Template[]>>({});
    const [shown, setShown] = createSignal<Record<string, Template>>({});

    const reshuffle = (from: Record<string, Template[]>): void => {
        const next: Record<string, Template> = {};
        for (const c of CHOICES) {
            const t = pick(from[c.value] ?? []);
            if (t) next[c.value] = t;
        }
        setShown(next);
    };

    onMount(() => {
        void Promise.all(CHOICES.map((c) => startersFor(c.value)))
            .then((lists) => {
                const byFormat: Record<string, Template[]> = {};
                CHOICES.forEach((c, i) => (byFormat[c.value] = lists[i] ?? []));
                setPool(byFormat);
                reshuffle(byFormat);
            })
            .catch(() => undefined);
    });

    const go = async (format: Surface): Promise<void> => {
        if (onboardingBusy()) return;
        const template = shown()[format];
        if (!template) return;
        setPicked(format);
        setFailed(false);
        const id = await chooseFormat(format, template.id);
        // the answer is recorded either way, so a failed starter drops the user in the library rather
        // than trapping them on this screen
        if (id) navigate(`/edit/${id}`);
        else {
            setFailed(true);
            setPicked(null);
        }
    };

    return (
        <div class="grid min-h-dvh place-items-center px-6 py-12">
            <div class="w-full max-w-260">
                <Eyebrow tone="soft" tracking="wider">
                    Welcome to Galleo
                </Eyebrow>
                <h1
                    class="mt-3 font-display text-[30px] font-semibold text-ink"
                    style={{ "text-wrap": "balance" }}
                >
                    What are you making first?
                </h1>
                <p class="mt-2 max-w-110 text-[14.5px] text-soft">
                    One engine renders all three, so you can change your mind later. We will open
                    the starter below, ready to edit.
                </p>

                <div class="mt-8 grid gap-4 md:grid-cols-3">
                    <For each={CHOICES}>
                        {(c) => {
                            const template = (): Template | undefined => shown()[c.value];
                            const busy = (): boolean => picked() === c.value;
                            return (
                                <button
                                    class="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
                                    disabled={onboardingBusy() || !template()}
                                    onClick={() => void go(c.value)}
                                >
                                    <div class="relative grid aspect-video place-items-center overflow-hidden border-b border-line bg-canvas">
                                        <Show when={template()} fallback={<Spinner size={18} />}>
                                            {(t) => (
                                                <MiniCanvas
                                                    section={t().content.sections[0]!}
                                                    themeId={appTheme()}
                                                    formatId={c.value}
                                                    width={PREVIEW_W}
                                                />
                                            )}
                                        </Show>
                                        <Show when={busy()}>
                                            <div class="absolute inset-0 grid place-items-center bg-panel/70">
                                                <Spinner size={20} tone="accent" />
                                            </div>
                                        </Show>
                                    </div>
                                    <div class="flex flex-col gap-1 px-4 py-3.5">
                                        <span class="flex items-center gap-2 text-ink">
                                            <Icon name={c.icon} size={16} />
                                            <span class="text-[14.5px] font-semibold">
                                                {c.label}
                                            </span>
                                        </span>
                                        <span class="text-[13px] text-soft">{c.blurb}</span>
                                        <Show when={template()}>
                                            {(t) => (
                                                <span class="mt-1 truncate text-[12px] text-muted">
                                                    Starts from {t().name}
                                                </span>
                                            )}
                                        </Show>
                                    </div>
                                </button>
                            );
                        }}
                    </For>
                </div>

                <Show when={failed()}>
                    <p class="mt-5 text-[13px] text-soft">
                        We could not open that starter just now. Your choice is saved, so head to
                        the library and pick a template when you are ready.
                    </p>
                </Show>

                <div class="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <button
                        class="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
                        disabled={onboardingBusy()}
                        onClick={() => navigate("/")}
                    >
                        Skip, take me to my library
                    </button>
                    <Show when={Object.keys(shown()).length > 0}>
                        <button
                            class="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
                            disabled={onboardingBusy()}
                            onClick={() => reshuffle(pool())}
                        >
                            Show me different starters
                        </button>
                    </Show>
                </div>
            </div>
        </div>
    );
};
