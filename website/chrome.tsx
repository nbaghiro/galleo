import { createSignal, onMount, Show, type Component } from "solid-js";
import { Mark } from "@ui/brand";
import { capture } from "@ui/analytics";
import { PrivacyControls } from "@ui/privacy";
import { Icon } from "@ui/icons";
import {
    DEFAULT_THEME,
    registerThemes,
    resolveTheme,
    type Theme,
    type ThemeSummary,
} from "@themes";
import { readUserPrefs } from "@model/workspace";

// Which placement earned the account. The landing itself is a $pageview carrying the referrer and
// the click id; this is the click that leaves for signup, so the two together close the loop from
// an ad to a paid plan.
export const ctaClicked = (placement: string) => (): void => {
    capture("signup_cta_clicked", { placement }, { beacon: true });
};

// `href` so the legal pages, which have no #top of their own, can point it back at the landing
export const BrandLink: Component<{ href?: string }> = (props) => (
    <a href={props.href ?? "#top"} class="flex items-center gap-2.5">
        <Mark size={34} />
        <span class="font-mono font-bold text-xl tracking-wider">Galleo</span>
    </a>
);

/**
 * Whether this visitor is signed in. The session cookie is httpOnly, so it has to be asked for, and
 * `null` means still asking, which reads as signed out until it resolves.
 *
 * Module level and fetched once: the nav and the hero both need the answer, and two components each
 * running their own check would ask /api/me twice on every page load and could disagree for a frame.
 */
const [signedIn, setAuthed] = createSignal<boolean | null>(null);
const [publicTheme, setPublicTheme] = createSignal(DEFAULT_THEME.id);

function adoptTheme(id: string): void {
    setPublicTheme(resolveTheme(id).id);
}

let asked = false;
function askAuth(): void {
    if (asked) return;
    asked = true;
    try {
        const custom: Theme[] = JSON.parse(localStorage.getItem("galleo:custom-themes") || "[]");
        if (Array.isArray(custom))
            registerThemes(custom.filter((theme) => theme?.id && theme.tokens));
        adoptTheme(localStorage.getItem("galleo:app-theme") || DEFAULT_THEME.id);
    } catch {
        /* Storage is optional; the account preference still loads below. */
    }
    void (async () => {
        try {
            const res = await fetch("/api/me", { credentials: "same-origin" });
            setAuthed(res.ok);
            if (!res.ok) return;
            const body: unknown = await res.json();
            if (!body || typeof body !== "object" || !("user" in body)) return;
            const user = body.user;
            if (!user || typeof user !== "object" || !("prefs" in user)) return;
            const id = readUserPrefs(user.prefs).appTheme ?? DEFAULT_THEME.id;
            if (resolveTheme(id).id !== id) {
                const response = await fetch("/api/themes", { credentials: "same-origin" });
                if (response.ok) {
                    const { themes }: { themes: ThemeSummary[] } = await response.json();
                    registerThemes(
                        themes.map((theme) => ({
                            id: theme.id,
                            name: theme.name,
                            tag: theme.mood ?? "custom",
                            dark: theme.isDark,
                            tokens: theme.tokens,
                        })),
                    );
                }
            }
            adoptTheme(id);
        } catch {
            if (signedIn() === null) setAuthed(false);
        }
    })();
}

export const AuthCta: Component = () => {
    onMount(askAuth);
    return (
        <div class="flex items-center gap-3">
            <PrivacyControls />
            <Show
                when={signedIn()}
                fallback={
                    <>
                        <a
                            href="/login"
                            class="hidden sm:inline lab hover:text-accent transition-colors"
                        >
                            Sign in
                        </a>
                        <a
                            href="/signup"
                            class="btn btn-primary text-sm"
                            onClick={ctaClicked("nav")}
                            style={{ padding: "0.6rem 1.1rem" }}
                        >
                            Start free
                        </a>
                    </>
                }
            >
                <a href="/" class="btn btn-primary text-sm" style={{ padding: "0.6rem 1.1rem" }}>
                    Go to app <Icon name="chevronRight" size={18} />
                </a>
            </Show>
        </div>
    );
};

export const authed = signedIn;
export { publicTheme };
