import type { Component } from "solid-js";
import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Surface } from "@model/ai";
import type { Template } from "@model/templates";
import { mustConfirmEmail, VERIFY_CODE_LENGTH } from "@model/workspace";
import { Eyebrow, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { ArtifactPlate } from "@app/components/previews";
import { ConfirmCodeField } from "@app/components/ConfirmCode";
import { OnboardingSteps } from "@app/components/OnboardingSteps";
import { api } from "@app/api";
import { user, verifyMailSent } from "@app/stores/auth";
import { appTheme } from "@app/stores/theme";
import {
    chooseFormat,
    onboarding,
    onboardingBusy,
    onboardingNeeded,
    startersFor,
} from "@app/stores/onboarding";

// The one question. It is asked because the answer is used: `format` picks the render profile, filters
// the starters, and becomes the studio default. Each card shows the artifact it will actually open, so
// the choice is not blind and the click honours what was on screen. Nothing here spends credits: the
// starter is a template, and the generation budget belongs to the user's own first brief.

interface Choice {
    value: Surface;
    label: string;
    icon: string;
    blurb: string;
    layoutW: number; // the format's own layout width, which is what sets its proportion
}

const CHOICES: Choice[] = [
    {
        value: "deck",
        label: "A deck",
        icon: "deck",
        blurb: "Slides you present or send.",
        layoutW: 1280,
    },
    {
        value: "doc",
        label: "A document",
        icon: "doc",
        blurb: "Long-form, one reading column.",
        // the editor lays a doc's column out at maxContentWidth (1000), reached once fullW hits
        // 1064; passing the 816 page width instead rendered it at 752 and read too narrow
        layoutW: 1064,
    },
    {
        value: "web",
        label: "A site",
        icon: "site",
        blurb: "A page that scrolls, full width.",
        layoutW: 1440,
    },
];

// The editor shows every format as a running stack, so each plate is the top of one, cropped. One
// scale across the row (set by the widest page) keeps the three comparable rather than each being
// normalised into its own box: a doc is genuinely narrower than a site.
// Said on the confirm step because a step with nothing behind it is one people abandon.
const AFTER_VERIFY = [
    "200 credits, on the house, for your first generations",
    "A starter deck, doc or site in the format you pick next",
    "The studio, with AI editing on every section",
];

// Step one of the same flow the format question finishes. It lives here rather than on the auth page
// because signing up is done: the account exists and is signed in, it just cannot reach anything yet.
const VerifyStep: Component = () => {
    const [resending, setResending] = createSignal(false);
    const [resent, setResent] = createSignal(false);
    const [failed, setFailed] = createSignal(false);

    const resend = async (): Promise<void> => {
        setResending(true);
        setFailed(false);
        try {
            await api.resendVerification();
            setResent(true);
        } catch {
            setFailed(true);
        } finally {
            setResending(false);
        }
    };
    return (
        <div class="w-full max-w-140">
            <OnboardingSteps current={1} />
            <Eyebrow tone="soft" tracking="wider">
                Welcome to Galleo
            </Eyebrow>
            <h1
                class="mt-3 font-display text-[30px] font-semibold text-ink"
                style={{ "text-wrap": "balance" }}
            >
                Confirm your email to begin
            </h1>
            <p class="mt-2.5 text-[14px] leading-relaxed text-soft">
                We sent a {VERIFY_CODE_LENGTH}-digit code to{" "}
                <span class="font-semibold text-ink">{user()?.email}</span>. Type it below and you
                carry straight on, in this tab.
            </p>

            <div class="mt-6">
                <ConfirmCodeField layout="step" withButton />
            </div>

            <Show when={!verifyMailSent()}>
                <div class="mt-6 rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed text-soft">
                    That message did not go out. Write to support@galleo.app and we will confirm the
                    address by hand.
                </div>
            </Show>

            <div class="mt-6 rounded-xl border border-line bg-panel p-5">
                <p class="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Waiting on the other side
                </p>
                <ul class="mt-3 flex flex-col gap-2.5 text-[13.5px] text-soft">
                    <For each={AFTER_VERIFY}>
                        {(line) => (
                            <li class="flex items-start gap-2.5">
                                <span class="mt-[7px] size-1 flex-none rounded-full bg-accent" />
                                <span>{line}</span>
                            </li>
                        )}
                    </For>
                </ul>
            </div>

            <p class="mt-6 text-[13px] text-muted">
                <Show when={!failed()} fallback={<>Could not send that again. Try in a minute.</>}>
                    Nothing yet? Look in spam, then{" "}
                    <button
                        type="button"
                        class="font-semibold text-accent hover:underline disabled:opacity-50"
                        disabled={resending() || resent()}
                        onClick={() => void resend()}
                    >
                        {resent() ? "sent again" : "send it again"}
                    </button>
                    .
                </Show>
            </p>
        </div>
    );
};

const STACK_DEPTH = 5;
const PLATE_H = 184;
const PLATE_MAX_W = 244;
// head margin inside the plate, so section one is not pinned to the card edge
const PLATE_PAD_TOP = 16;
const SCALE = PLATE_MAX_W / Math.max(...CHOICES.map((c) => c.layoutW));
const plateW = (c: Choice): number => Math.round(c.layoutW * SCALE);

const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

// The gate's client-side twin: same date, same question, so the surface agrees with the routes.
const needsVerify = (): boolean => {
    const u = user();
    return !!u && mustConfirmEmail(u);
};

export const OnboardingView: Component = () => {
    const navigate = useNavigate();
    // The screen belongs to a first session only. `needed` is server-derived (no format answer
    // recorded and an empty workspace), so an established account that types the URL is sent to the
    // library rather than shown a welcome it already answered. `leaving` covers the moment the
    // answer lands: choosing a format makes `needed` false, and without it this guard would race
    // the navigation to the new artifact and win.
    const [leaving, setLeaving] = createSignal(false);
    createEffect(() => {
        if (leaving()) return;
        const s = onboarding();
        if (s && !s.needed) navigate("/", { replace: true });
    });
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
        setLeaving(true);
        setPicked(format);
        setFailed(false);
        const id = await chooseFormat(format, template);
        // the answer is recorded either way, so a failed starter drops the user in the library rather
        // than trapping them on this screen
        if (id) navigate(`/edit/${id}`);
        else {
            setLeaving(false);
            setFailed(true);
            setPicked(null);
        }
    };

    return (
        <Show
            when={needsVerify() || onboardingNeeded() || leaving()}
            fallback={<div class="grid min-h-dvh place-items-center" />}
        >
            <div class="grid min-h-dvh place-items-center px-6 py-12">
                <Show when={!needsVerify()} fallback={<VerifyStep />}>
                    <div class="w-full max-w-260">
                        <OnboardingSteps current={2} />
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
                            One engine renders all three, so you can change your mind later. We will
                            open the starter below, ready to edit.
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
                                            <div
                                                class="relative overflow-hidden border-b border-line bg-canvas"
                                                style={{
                                                    height: `${PLATE_H}px`,
                                                    // the stack runs on past the crop, so the foot fades
                                                    "mask-image":
                                                        "linear-gradient(180deg,#000 82%,transparent 100%)",
                                                }}
                                            >
                                                <Show
                                                    when={template()}
                                                    fallback={<Spinner size={18} />}
                                                >
                                                    {(t) => (
                                                        <ArtifactPlate
                                                            content={t().content}
                                                            themeId={appTheme()}
                                                            width={plateW(c)}
                                                            layoutWidth={c.layoutW}
                                                            depth={STACK_DEPTH}
                                                            padTop={PLATE_PAD_TOP}
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
                                We could not open that starter just now. Your choice is saved, so
                                head to the library and pick a template when you are ready.
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
                </Show>
            </div>
        </Show>
    );
};
