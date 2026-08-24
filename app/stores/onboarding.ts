import { createMemo, createSignal } from "solid-js";
import type { OnboardingState, OnboardingStep } from "@model/workspace";
import { newlyDone, ONBOARDING_STEPS } from "@model/workspace";
import type { Surface } from "@model/ai";
import { api } from "@app/api";
import type { Template } from "@model/templates";
import { templatesOnce, templateUsesOnce } from "@app/stores/templates";
import { setUser, user } from "@app/stores/auth";
import { appTheme } from "@app/stores/theme";
import { capture } from "@ui/analytics";

// The first session. Server-derived, so this store holds no step state of its own: it caches the last
// answer and re-reads it after anything that could tick a step. See .docs/onboarding.md.

const [state, setState] = createSignal<OnboardingState | null>(null);
const [busy, setBusy] = createSignal(false);

/** Milliseconds since this account answered the format question, which is when the flow begins. */
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

/** How many of a format's most-used templates we rotate between, so a first run is not always identical. */
const STARTER_POOL = 4;

/**
 * The starters we would open for a format, most-used first over the counts the templates page already
 * keeps. Returned rather than resolved to one id so the welcome screen can show what it will open and
 * then open exactly that: a preview the click does not honour is worse than no preview.
 */
export async function startersFor(format: Surface): Promise<Template[]> {
    const [all, uses] = await Promise.all([
        templatesOnce().catch(() => []),
        templateUsesOnce().catch(() => ({}) as Record<string, number>),
    ]);
    return all
        .filter((t) => t.content.format === format)
        .sort((a, b) => (uses[b.id] ?? 0) - (uses[a.id] ?? 0))
        .slice(0, STARTER_POOL);
}

/**
 * Answer the format question and open a starter artifact. Records the answer first, so a failure
 * anywhere after it leaves the user in the library rather than back on the question, and returns the
 * artifact id to navigate to (null when we could not build one).
 *
 * Deliberately spends no credits: the starter is a template, and the generation budget is the user's
 * to spend on their own first brief.
 */
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
