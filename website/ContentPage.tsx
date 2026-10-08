import { For, Show, type Component } from "solid-js";
import { TEMPLATE_INDEX } from "@model/templates";
import { AuthCta, BrandLink, ctaClicked } from "./chrome";
import { MARKETING_PAGES, type MarketingPage } from "./routes";

export const ContentPage: Component<{ page: MarketingPage }> = (props) => {
    const entry = () => TEMPLATE_INDEX.find((item) => item.id === props.page.templateId);
    const start = ctaClicked("product_page");
    return (
        <div class="web h-full overflow-y-auto bg-canvas text-ink font-body">
            <header class="border-b border-line">
                <div class="mx-auto max-w-280 px-5 py-5 flex flex-wrap items-center justify-between gap-5">
                    <BrandLink href="/" />
                    <AuthCta />
                </div>
            </header>
            <main class="mx-auto max-w-280 px-5 py-14 md:py-20">
                <nav aria-label="Breadcrumb" class="text-sm text-muted mb-8">
                    <a href="/" class="underline">
                        Galleo
                    </a>
                    <Show when={props.page.templateId}>
                        {" "}
                        /{" "}
                        <a href="/presentation-templates" class="underline">
                            Presentation templates
                        </a>
                    </Show>
                </nav>
                <h1 class="sec-title text-4xl md:text-6xl max-w-240">{props.page.heading}</h1>
                <p class="text-lg text-soft leading-relaxed max-w-200 mt-7">{props.page.intro}</p>
                <div class="mt-8">
                    <a class="btn btn-primary" href="/signup" onClick={start}>
                        Start creating free
                    </a>{" "}
                    <a href="/#pricing" class="ml-4 underline text-soft">
                        See pricing
                    </a>
                </div>
                <Show when={entry()}>
                    {(template) => (
                        <aside class="border border-line rounded-lg bg-surface p-6 mt-10">
                            <p class="font-bold">
                                In the Galleo template library: {template().name}
                            </p>
                            <p class="text-soft mt-2">{template().description}</p>
                            <p class="text-muted text-sm mt-3">
                                Sign in, open Templates and choose this starter. Replace all example
                                material before sharing.
                            </p>
                        </aside>
                    )}
                </Show>
                <For each={props.page.sections}>
                    {(section) => (
                        <section class="mt-12 max-w-200">
                            <h2 class="sec-title text-2xl md:text-3xl">{section.heading}</h2>
                            <p class="mt-4 text-soft leading-relaxed">{section.body}</p>
                            <Show when={section.items}>
                                <ul class="list-disc pl-6 mt-4 space-y-3 text-soft">
                                    <For each={section.items}>{(item) => <li>{item}</li>}</For>
                                </ul>
                            </Show>
                        </section>
                    )}
                </For>
                <section class="mt-14 max-w-200">
                    <h2 class="sec-title text-3xl">Questions before you start</h2>
                    <For each={props.page.questions}>
                        {(item) => (
                            <div class="mt-7">
                                <h3 class="font-bold text-lg">{item.question}</h3>
                                <p class="mt-2 text-soft leading-relaxed">{item.answer}</p>
                            </div>
                        )}
                    </For>
                </section>
                <nav aria-label="Explore Galleo" class="mt-16 border-t border-line pt-8">
                    <h2 class="sec-title text-2xl">Explore what you can make</h2>
                    <ul class="grid sm:grid-cols-2 gap-4 mt-6">
                        <For each={MARKETING_PAGES.filter((page) => page.path !== props.page.path)}>
                            {(page) => (
                                <li>
                                    <a
                                        class="text-accent underline underline-offset-4"
                                        href={page.path}
                                    >
                                        {page.heading}
                                    </a>
                                </li>
                            )}
                        </For>
                    </ul>
                </nav>
            </main>
            <footer class="border-t border-line px-5 py-8 flex flex-wrap justify-center gap-6 text-sm text-muted">
                <a href="/">Galleo</a>
                <a href="/#pricing">Pricing</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
            </footer>
        </div>
    );
};
