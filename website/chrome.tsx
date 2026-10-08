import { createSignal, onMount, Show, type Component } from "solid-js";
import { Mark } from "@ui/brand";
import { capture } from "@ui/analytics";
import { Icon } from "@ui/icons";

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
let asked = false;
function askAuth(): void {
    if (asked) return;
    asked = true;
    void (async () => {
        try {
            const res = await fetch("/api/me", { credentials: "same-origin" });
            setAuthed(res.ok);
        } catch {
            setAuthed(false);
        }
    })();
}

export const AuthCta: Component = () => {
    onMount(askAuth);
    return (
        <div class="flex items-center gap-3">
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
