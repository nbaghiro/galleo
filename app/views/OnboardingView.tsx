import type { Component } from "solid-js";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Surface } from "@model/ai";
import { asFormat } from "@model/analytics";
import type { Template } from "@model/templates";
import { mustConfirmEmail, VERIFY_CODE_LENGTH } from "@model/workspace";
import { Chip, Eyebrow, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { PLATE_CARD_W, PlateCard } from "@app/components/previews";
import { TemplatePreview } from "@app/components/TemplatePreview";
import { ConfirmCodeField } from "@app/components/ConfirmCode";
import { OnboardingSteps } from "@app/components/OnboardingSteps";
import { api } from "@app/api";
import { user, verifyMailSent } from "@app/stores/auth";
import { formatIcon, formatLabelPlural } from "@app/stores/library";
import { appTheme } from "@app/stores/theme";
import { capture } from "@ui/analytics";
import {
    chooseFormat,
    onboarding,
    onboardingBusy,
    onboardingNeeded,
    skipOnboarding,
    starterWall,
} from "@app/stores/onboarding";

// The first session's two screens: confirm the address, then pick something to start from.
//
// The format question is not asked in the abstract any more. It is answered by picking a piece, which
// is the same answer (`format` picks the render profile and becomes the studio default) arrived at by
// looking rather than by declaring. Nothing here spends credits: a starter is a template, and the
// generation budget belongs to the user's own first brief.

// Order matters twice: it is the chip order, and it is the order the wall deals the formats in.
const FORMAT_ORDER: Surface[] = ["deck", "doc", "web"];

// A screenful at a time as the wall is scrolled. Every tile paints a real section stack, so opening
// with all ninety would cost a second of layout nobody asked for.
const PAGE = 12;

// Said on the confirm step because a step with nothing behind it is one people abandon.
const AFTER_VERIFY = [
    "Monthly credits for AI writing and images",
    "A wall of starter decks, docs and sites, yours in one click",
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
    // answer lands: choosing a starter makes `needed` false, and without it this guard would race
    // the navigation to the new artifact and win.
    const [leaving, setLeaving] = createSignal(false);
    createEffect(() => {
        if (leaving()) return;
        const s = onboarding();
        if (s && !s.needed) navigate("/", { replace: true });
    });

    const [wall, setWall] = createSignal<Template[]>([]);
    const [format, setFormat] = createSignal<Surface | "all">("all");
    const [limit, setLimit] = createSignal(PAGE);
    const [preview, setPreview] = createSignal<Template | null>(null);
    const [failed, setFailed] = createSignal(false);

    onMount(() => {
        void starterWall(FORMAT_ORDER)
            .then(setWall)
            .catch(() => undefined);
    });

    const matching = createMemo(() => {
        const f = format();
        return f === "all" ? wall() : wall().filter((t) => t.content.format === f);
    });
    const shown = createMemo(() => matching().slice(0, limit()));

    const filterTo = (f: Surface | "all"): void => {
        if (f === format()) return;
        setFormat(f);
        setLimit(PAGE);
        capture("onboarding_starters_filtered", { format: f, shown: matching().length });
    };

    // Recorded before the navigation, not after: `needed` is what the library redirect reads, so
    // leaving without recording lands back here and the link reads as broken.
    const skip = async (): Promise<void> => {
        if (onboardingBusy()) return;
        setLeaving(true);
        if (await skipOnboarding(matching().length)) navigate("/");
        else setLeaving(false);
    };

    const open = (t: Template): void => {
        setPreview(t);
        capture("template_previewed", {
            template_id: t.id,
            category: t.category,
            format: asFormat(t.content.format),
        });
    };

    // The format the preview settled on, not the template's own: the switcher is the point of
    // previewing, so a doc previewed as a deck opens as a deck and answers the question that way.
    const use = async (chosen: string, template: Template): Promise<void> => {
        if (onboardingBusy()) return;
        setLeaving(true);
        setFailed(false);
        const id = await chooseFormat(asFormat(chosen), template);
        // the answer is recorded either way, so a failed starter drops the user in the library rather
        // than trapping them on this screen
        if (id) navigate(`/edit/${id}`);
        else {
            setLeaving(false);
            setFailed(true);
            setPreview(null);
        }
    };

    /**
     * The wall fills to a screenful and then pages in as it is scrolled.
     *
     * Both elements are signals rather than plain refs so the observer is built once both exist, in
     * whichever order Solid assigns them: capturing the scroller in a `let` read it before its ref
     * was set on one route, which silently left the observer rooted at the viewport, and an ancestor
     * with `overflow` clips a descendant out of the intersection entirely, so it then never fired.
     *
     * Re-armed after every growth, and rebuilt whenever the candidate set changes, which are two
     * halves of one problem: an observer reports transitions, not states. A page of cards is shorter
     * than the lead margin, so the sentinel can sit inside the band and never report again; and an
     * observer built before the catalog landed spends its one opening report on an empty wall. Both
     * left the grid stuck on its first page.
     */
    const [scroller, setScroller] = createSignal<HTMLElement>();
    const [tail, setTail] = createSignal<HTMLElement>();
    createEffect(() => {
        const root = scroller();
        const el = tail();
        const total = matching().length; // tracked, so a late catalog or a new filter rebuilds this
        if (!root || !el || total === 0) return;
        const io = new IntersectionObserver(
            (seen) => {
                if (limit() >= total || !seen.some((e) => e.isIntersecting)) return;
                setLimit((n) => Math.min(n + PAGE, total));
                requestAnimationFrame(() => {
                    io.unobserve(el);
                    io.observe(el); // observing reports afresh, whatever the state was
                });
            },
            { root, rootMargin: "600px" }, // lead, so the next rows paint before they are reached
        );
        io.observe(el);
        onCleanup(() => io.disconnect());
    });

    return (
        <Show
            when={needsVerify() || onboardingNeeded() || leaving()}
            fallback={<div class="grid min-h-dvh place-items-center" />}
        >
            <Show
                when={!needsVerify()}
                fallback={
                    <div class="grid min-h-dvh place-items-center px-6 py-12">
                        <VerifyStep />
                    </div>
                }
            >
                {/* the shell is h-dvh overflow-hidden, so a surface taller than the viewport owns
                    its own scrolling; without this the wall simply could not be scrolled to */}
                <div ref={setScroller} class="h-dvh overflow-y-auto px-6 py-10">
                    <div class="mx-auto w-full max-w-320">
                        <OnboardingSteps current={2} />
                        <div class="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                            <div>
                                <Eyebrow tone="soft" tracking="wider">
                                    Welcome to Galleo
                                </Eyebrow>
                                <h1
                                    class="mt-3 font-display text-[30px] font-semibold text-ink"
                                    style={{ "text-wrap": "balance" }}
                                >
                                    What are you making first?
                                </h1>
                                <p class="mt-2 max-w-125 text-[14.5px] text-soft">
                                    Pick something to start from. One engine renders all three, so
                                    you can change your mind later.
                                </p>
                            </div>
                            <button
                                class="mt-1 text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
                                disabled={onboardingBusy()}
                                onClick={() => void skip()}
                            >
                                Skip, take me to my library
                            </button>
                        </div>

                        <div class="mt-7 flex flex-wrap items-center gap-2">
                            <Chip
                                size="md"
                                selected={format() === "all"}
                                onClick={() => filterTo("all")}
                            >
                                Everything
                            </Chip>
                            <For each={FORMAT_ORDER}>
                                {(f) => (
                                    <Chip
                                        size="md"
                                        selected={format() === f}
                                        onClick={() => filterTo(f)}
                                    >
                                        <Icon name={formatIcon(f)} size={13} />
                                        {formatLabelPlural(f)}
                                    </Chip>
                                )}
                            </For>
                        </div>

                        <Show
                            when={shown().length > 0}
                            fallback={
                                <div class="grid h-80 place-items-center">
                                    <Spinner size={20} />
                                </div>
                            }
                        >
                            <div
                                class="mt-6 grid justify-center gap-x-5 gap-y-7"
                                style={{
                                    "grid-template-columns": `repeat(auto-fill, ${PLATE_CARD_W}px)`,
                                }}
                            >
                                <For each={shown()}>
                                    {(t) => (
                                        <PlateCard
                                            content={t.content}
                                            name={t.name}
                                            themeId={appTheme()}
                                            disabled={onboardingBusy()}
                                            onOpen={() => open(t)}
                                        />
                                    )}
                                </For>
                            </div>
                        </Show>

                        <div ref={setTail} class="h-px" />

                        <Show when={failed()}>
                            <p class="mt-6 text-center text-[13px] text-soft">
                                We could not open that starter just now. Your choice is saved, so
                                head to the library and pick a template when you are ready.
                            </p>
                        </Show>
                    </div>
                </div>
            </Show>

            <Show when={preview()}>
                {(t) => (
                    <TemplatePreview
                        template={t()}
                        busy={onboardingBusy()}
                        onBack={() => setPreview(null)}
                        onClose={() => setPreview(null)}
                        onUse={(chosen) => void use(chosen, t())}
                    />
                )}
            </Show>
        </Show>
    );
};
