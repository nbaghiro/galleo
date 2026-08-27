import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import type { OnboardingStep } from "@model/workspace";
import { ONBOARDING_STEPS } from "@model/workspace";
import { Eyebrow, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { openGenerate } from "@app/stores/generate";
import { go } from "@app/stores/navigate";
import { shareNewest } from "@app/stores/share";
import { checklistVisible, dismissChecklist, onboarding, stepDone } from "@app/stores/onboarding";

// Four steps, every one of them derived server-side from rows, so nothing here has to be ticked by a
// write path and the list is already right for an account that predates it. A checklist rather than a
// coachmark tour because the canvas reflows: the engine sizes every box from text metrics and the
// responsive tiers rearrange the chrome, so an anchored tour would point at nothing soon enough.

interface StepCopy {
    label: string;
    hint: string;
    /** False while the step cannot be acted on yet; it reads as disabled and says why. */
    ready?: () => boolean;
    blocked?: string;
    go?: () => void;
}

const COPY: Record<OnboardingStep, StepCopy> = {
    make: { label: "Make something", hint: "Start from a template", go: () => go("/templates") },
    ai: { label: "Write with AI", hint: "Describe it, we draft it", go: () => openGenerate() },
    theme: { label: "Make it yours", hint: "Build a theme", go: () => go("/settings") },
    send: {
        label: "Send it out",
        hint: "Share a link or export",
        // there is nothing to send until something exists, and `make` is that same row count
        ready: () => stepDone("make"),
        blocked: "Make something first",
        go: () => void shareNewest().then((shared) => shared || go("/")),
    },
};

export const OnboardingChecklist: Component = () => (
    <Show when={checklistVisible()}>
        <div class="mt-4 rounded-xl border border-line bg-canvas px-2.5 py-2.5">
            <div class="flex items-center justify-between pb-1.5">
                <Eyebrow tracking="wider">
                    Getting started · {onboarding()?.done.length ?? 0}/{ONBOARDING_STEPS.length}
                </Eyebrow>
                <IconButton
                    size="xs"
                    tone="muted"
                    title="Hide this"
                    onClick={() => void dismissChecklist()}
                >
                    <Icon name="close" size={12} />
                </IconButton>
            </div>
            <ul class="flex flex-col gap-0.5">
                <For each={ONBOARDING_STEPS}>
                    {(step) => {
                        const done = (): boolean => stepDone(step);
                        const copy = COPY[step];
                        const ready = (): boolean => copy.ready?.() ?? true;
                        return (
                            <li>
                                <button
                                    class="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] transition hover:bg-panel disabled:cursor-default disabled:hover:bg-transparent"
                                    disabled={done() || !ready()}
                                    title={done() ? undefined : ready() ? copy.hint : copy.blocked}
                                    onClick={() => copy.go?.()}
                                >
                                    <span
                                        class={`grid size-4 flex-none place-items-center rounded-full border ${done() ? "border-accent bg-accent text-onaccent" : "border-line text-transparent"}`}
                                    >
                                        <Icon name="check" size={10} />
                                    </span>
                                    <span
                                        class={
                                            done()
                                                ? "text-muted line-through"
                                                : ready()
                                                  ? "text-soft"
                                                  : "text-muted opacity-60"
                                        }
                                    >
                                        {copy.label}
                                    </span>
                                </button>
                            </li>
                        );
                    }}
                </For>
            </ul>
        </div>
    </Show>
);
