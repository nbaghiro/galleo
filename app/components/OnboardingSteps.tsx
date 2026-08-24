import type { Component } from "solid-js";
import { For } from "solid-js";
import { Icon } from "@ui/icons";

// The two steps that run before the app opens: confirm the address, then answer the format question.
// Rendered on both, so signing up reads as one flow rather than a dead end followed by a fresh start.
// The in-app checklist (make · ai · theme · send) is a separate thing and keeps its own affordance.
const STEPS = ["Confirm your email", "Choose a format"] as const;

export const OnboardingSteps: Component<{ current: 1 | 2 }> = (props) => (
    <ol class="mb-8 flex items-center gap-3" aria-label="Getting started">
        <For each={STEPS}>
            {(label, i) => {
                const n = (): number => i() + 1;
                const done = (): boolean => n() < props.current;
                const active = (): boolean => n() === props.current;
                return (
                    <>
                        <li
                            class="flex items-center gap-2"
                            aria-current={active() ? "step" : undefined}
                        >
                            <span
                                class="grid size-5 flex-none place-items-center rounded-full text-[10px] font-bold"
                                classList={{
                                    "bg-accent text-onaccent": active() || done(),
                                    "bg-line text-muted": !active() && !done(),
                                }}
                            >
                                {done() ? <Icon name="check" size={11} /> : n()}
                            </span>
                            <span
                                class="text-[12px] font-semibold"
                                classList={{
                                    "text-ink": active(),
                                    "text-muted": !active(),
                                }}
                            >
                                {label}
                            </span>
                        </li>
                        <span
                            class="h-px w-6 flex-none bg-line"
                            classList={{ hidden: n() === STEPS.length }}
                        />
                    </>
                );
            }}
        </For>
    </ol>
);
