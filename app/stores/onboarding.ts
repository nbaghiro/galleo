import { createMemo, createSignal } from "solid-js";
import type { OnboardingState, OnboardingStep } from "@model/workspace";
import { newlyDone, ONBOARDING_STEPS } from "@model/workspace";
import type { Surface } from "@model/ai";
import { api } from "@app/api";
import type { Template } from "@model/templates";
import { templatesOnce } from "@app/stores/templates";
import { setUser, user } from "@app/stores/auth";
import { appTheme } from "@app/stores/theme";
import { capture } from "@ui/analytics";

// The first session. Server-derived, so this store holds no step state of its own: it caches the last
// answer and re-reads it after anything that could tick a step. See .docs/onboarding.md.

const [state, setState] = createSignal<OnboardingState | null>(null);
const [busy, setBusy] = createSignal(false);

/** Milliseconds since this account's first session began, which is the format answer or the skip. */
export const sinceStart = (): number | undefined => {
    const at = user()?.prefs.onboarding?.startedAt;
    return at ? Date.now() - new Date(at).getTime() : undefined;
};

const elapsed = (): { ms_since_signup?: number } => {
    const ms = sinceStart();
    return ms === undefined ? {} : { ms_since_signup: ms };
};

export const onboarding = state;
export const onboardingBusy = busy;

export const onboardingNeeded = createMemo(() => state()?.needed === true);

/** Shown while there is something left to do and the user has not dismissed it. */
export const checklistVisible = createMemo(() => {
    const s = state();
    if (!s || s.dismissed || s.needed) return false;
    return s.done.length < ONBOARDING_STEPS.length;
});

export const stepDone = (step: OnboardingStep): boolean => state()?.done.includes(step) === true;

export async function loadOnboarding(): Promise<void> {
    const before = state()?.done;
    const got = await api.getOnboarding().catch(() => null);
    if (!got) return;
    // The steps are derived from rows server-side, so a step lands when a re-read says so rather
    // than when the client thinks it did.
    for (const step of newlyDone(before, got.onboarding.done))
        capture("onboarding_checklist_step_done", { step, ...elapsed() });
    setState(got.onboarding);
}

/**
 * The wall's order: each format shuffled, then dealt round-robin across the three, so consecutive
 * cards are a deck, then a doc, then a site. The mix is the argument the screen makes, that one
 * engine renders all three, and a wall sorted by anything else groups the formats into blocks that
 * bury two of them below the fold.
 *
 * Shuffled rather than ordered by use count: the wall now scrolls to the whole catalog, so nothing
 * is unreachable, and two people signing up on the same day should not meet the same nine tiles.
 * The deal order is the argument's order, which is also the order the chips are in.
 */
export async function starterWall(formats: readonly Surface[]): Promise<Template[]> {
    const all = await templatesOnce().catch(() => []);
    const byFormat = formats.map((f) => shuffle(all.filter((t) => t.content.format === f)));
    const out: Template[] = [];
    for (let i = 0; i < Math.max(...byFormat.map((l) => l.length), 0); i++)
        for (const list of byFormat) if (list[i]) out.push(list[i]!);
    return out;
}

const shuffle = <T>(xs: T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
};

export async function chooseFormat(format: Surface, template: Template): Promise<string | null> {
    if (busy()) return null;
    setBusy(true);
    try {
        const { user: fresh } = await api.updatePrefs({
            onboarding: { format, startedAt: new Date().toISOString() },
        });
        setUser(fresh);
        capture("onboarding_format_chosen", { format });
        // templateId alone only records popularity; the body has to be sent, or the artifact opens
        // empty. Format and theme come from this screen, not the template's own, so what the user
        // saw previewed is what they land in.
        const theme = appTheme();
        const { id } = await api.createArtifact({
            title: template.name,
            formatId: format,
            themeId: theme,
            draftContent: { ...template.content, format, theme },
            templateId: template.id,
        });
        capture("onboarding_starter_opened", {
            format,
            template_id: template.id,
            ...elapsed(),
        });
        await loadOnboarding();
        return id;
    } catch {
        return null;
    } finally {
        setBusy(false);
    }
}

/**
 * Leave the wall without picking anything. Records the start with no format, which is what makes
 * `needed` false: it is derived as `!startedAt && artifacts === 0`, so without this the library
 * redirect in `AppShell` sends the user straight back and the skip does nothing at all. The studio
 * keeps its own format default afterwards, because this user never told us one.
 */
export async function skipOnboarding(shown: number): Promise<boolean> {
    if (busy()) return false;
    setBusy(true);
    try {
        const { user: fresh } = await api.updatePrefs({
            onboarding: { startedAt: new Date().toISOString() },
        });
        setUser(fresh);
        capture("onboarding_skipped", { shown });
        await loadOnboarding();
        return true;
    } catch {
        return false;
    } finally {
        setBusy(false);
    }
}

export async function dismissChecklist(): Promise<void> {
    const s = state();
    capture("onboarding_checklist_dismissed", { steps_done: s?.done.length ?? 0 });
    if (s) setState({ ...s, dismissed: true }); // optimistic: the list is chrome, not data
    const got = await api.updatePrefs({ onboarding: { dismissed: true } }).catch(() => null);
    if (got) setUser(got.user);
}

/** The format the studio should default to, once the user has told us. */
export const preferredFormat = (): Surface | undefined =>
    state()?.format ?? user()?.prefs.onboarding?.format;
