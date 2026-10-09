import { createSignal, onMount, Show, splitProps, type Component, type JSX } from "solid-js";
import { analyticsConsent, setAnalyticsConsent } from "./analytics";
import { Button } from "./button";

export const PrivacyControls: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
    const [own, rest] = splitProps(props, ["class"]);
    const [ready, setReady] = createSignal(false);
    const [editing, setEditing] = createSignal(false);
    onMount(() => setReady(true));
    const choose = (value: "accepted" | "essential"): void => {
        setAnalyticsConsent(value);
        setEditing(false);
    };
    return (
        <div {...rest} class={own.class}>
            <Show when={ready()}>
                <Show
                    when={analyticsConsent() === null || editing()}
                    fallback={
                        <div class="fixed bottom-3 left-3 z-50">
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                                Privacy settings
                            </Button>
                        </div>
                    }
                >
                    <section
                        aria-label="Privacy preferences"
                        class="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-lg border border-line bg-panel p-5 text-ink shadow-lg"
                    >
                        <h2 class="font-bold text-base">Your privacy choices</h2>
                        <p class="mt-2 text-sm leading-relaxed text-soft">
                            Essential storage keeps Galleo working. With your permission, we also
                            use analytics and masked session recordings to understand and improve
                            the product. You can change your choice in Privacy settings.
                        </p>
                        <a
                            href="/privacy#cookies"
                            class="mt-2 inline-block text-sm text-accent underline underline-offset-4"
                        >
                            Read our Privacy Policy
                        </a>
                        <div class="mt-4 flex flex-wrap gap-3">
                            <Button variant="outline" onClick={() => choose("essential")}>
                                Essential only
                            </Button>
                            <Button variant="outline" onClick={() => choose("accepted")}>
                                Accept analytics
                            </Button>
                        </div>
                    </section>
                </Show>
            </Show>
        </div>
    );
};
