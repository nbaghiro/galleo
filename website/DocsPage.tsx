import { createMemo, createSignal, For, onMount, Show, type Component } from "solid-js";
import { resolveTheme, themeCssVars, THEME_LIST } from "@themes";
import { queryBucket } from "@model/analytics";
import { capture } from "@ui/analytics";
import { TextField } from "@ui/inputs";
import { Icon, UiThemeProvider } from "@ui/icons";
import { SelectField } from "@ui/select";
import { AuthCta, BrandLink } from "./chrome";
import { DOC_ARTICLES, searchDocs, type DocArticle } from "./docs";

const groups = [...new Set(DOC_ARTICLES.map((article) => article.group))];

export const DocsPage: Component<{ article?: DocArticle }> = (props) => {
    const [query, setQuery] = createSignal("");
    const [theme, setTheme] = createSignal("studio");
    const results = createMemo(() => searchDocs(query()));
    const searching = () => query().trim().length > 0;
    const position = () =>
        DOC_ARTICLES.findIndex((article) => article.slug === props.article?.slug);
    const next = () => DOC_ARTICLES[position() + 1];
    const previous = () => DOC_ARTICLES[position() - 1];
    const tokens = () => resolveTheme(theme()).tokens;
    const vars = () => themeCssVars(tokens());
    onMount(() => {
        try {
            const saved = localStorage.getItem("galleo-docs-theme");
            if (THEME_LIST.some((item) => item.id === saved)) setTheme(saved!);
        } catch {
            /* Storage can be unavailable in private browsing. */
        }
        capture("docs_opened", { article: props.article?.slug ?? "overview" });
    });
    const chooseTheme = (value: string): void => {
        setTheme(value);
        try {
            localStorage.setItem("galleo-docs-theme", value);
        } catch {
            /* Optional preference. */
        }
        capture("docs_theme_changed", { theme_id: value });
    };
    const noteSearch = (): void => {
        if (searching())
            capture("docs_searched", {
                query_length: queryBucket(query().length),
                results: results().length,
            });
    };
    const navigation = () => (
        <For each={groups}>
            {(group) => (
                <div class="mt-6">
                    <p class="lab text-muted mb-3">{group}</p>
                    <ul class="space-y-1">
                        <For each={DOC_ARTICLES.filter((article) => article.group === group)}>
                            {(article) => (
                                <li>
                                    <a
                                        href={`/docs/${article.slug}`}
                                        aria-current={
                                            props.article?.slug === article.slug
                                                ? "page"
                                                : undefined
                                        }
                                        class="docs-nav-link block rounded-md px-3 py-2 text-sm text-soft hover:bg-panel hover:text-ink"
                                    >
                                        {article.title}
                                    </a>
                                </li>
                            )}
                        </For>
                    </ul>
                </div>
            )}
        </For>
    );
    return (
        <UiThemeProvider tokens={tokens}>
            <div
                class="web docs-shell h-full overflow-y-auto bg-canvas text-ink font-body"
                style={vars()}
            >
                <a class="docs-skip" href="#docs-content">
                    Skip to content
                </a>
                <header class="sticky top-0 z-30 border-b border-line bg-canvas">
                    <div class="mx-auto max-w-400 px-5 md:px-8 py-4 flex flex-wrap items-center gap-5">
                        <BrandLink href="/" />
                        <a href="/docs" class="text-sm border-l border-line pl-5 text-soft">
                            Product guide
                        </a>
                        <div class="ml-auto flex items-center gap-4">
                            <div class="w-36" role="group" aria-label="Guide theme">
                                <SelectField
                                    label="Guide theme"
                                    value={theme()}
                                    options={THEME_LIST.map((item) => ({
                                        value: item.id,
                                        label: item.name,
                                    }))}
                                    onChange={chooseTheme}
                                />
                            </div>
                            <AuthCta />
                        </div>
                    </div>
                </header>
                <div class="mx-auto max-w-400 px-5 md:px-8 docs-layout">
                    <nav
                        aria-label="Documentation"
                        class="hidden lg:block docs-sidebar border-r border-line pr-7 pb-10"
                    >
                        <a href="/docs" class="block font-bold pt-8">
                            Guide overview
                        </a>
                        {navigation()}
                    </nav>
                    <main id="docs-content" class="min-w-0 py-8 md:py-12 pb-20">
                        <details class="lg:hidden border border-line rounded-lg p-4 mb-6">
                            <summary class="cursor-pointer font-bold">Browse the guide</summary>
                            <nav aria-label="Mobile documentation">{navigation()}</nav>
                        </details>
                        <div class="mb-10">
                            <TextField
                                type="search"
                                aria-label="Search documentation"
                                placeholder="Search guides, tools, and workflows"
                                value={query()}
                                onChange={setQuery}
                                onBlur={noteSearch}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") noteSearch();
                                }}
                            />
                        </div>
                        <Show
                            when={searching()}
                            fallback={
                                <>
                                    <p class="lab text-accent mb-4">
                                        {props.article?.group ?? "THE GALLEO FIELD GUIDE"}
                                    </p>
                                    <h1 class="sec-title text-4xl md:text-6xl leading-tight max-w-240">
                                        {props.article?.title ??
                                            "From your first idea to the final share."}
                                    </h1>
                                    <p class="text-lg leading-relaxed text-soft mt-6 max-w-200">
                                        {props.article?.description ??
                                            "Learn how to create, shape, and deliver your work in Galleo. Start with a guided workflow or find the answer you need along the way."}
                                    </p>
                                    <Show
                                        when={props.article}
                                        fallback={
                                            <>
                                                <div
                                                    class="docs-format-map mt-10 grid sm:grid-cols-3 gap-3"
                                                    aria-label="One source of content, three formats"
                                                >
                                                    <div class="sm:col-span-3 lab text-muted">
                                                        One piece of content
                                                    </div>
                                                    <For
                                                        each={[
                                                            {
                                                                name: "Deck",
                                                                body: "Guide the room through a sequence.",
                                                            },
                                                            {
                                                                name: "Document",
                                                                body: "Give readers room to explore the detail.",
                                                            },
                                                            {
                                                                name: "Website",
                                                                body: "Share a continuous page in a browser.",
                                                            },
                                                        ]}
                                                    >
                                                        {(format) => (
                                                            <div class="border border-line rounded-lg bg-panel p-5">
                                                                <h2 class="sec-title text-2xl">
                                                                    {format.name}
                                                                </h2>
                                                                <p class="mt-2 text-sm text-soft">
                                                                    {format.body}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </For>
                                                </div>
                                                <a
                                                    class="docs-start block mt-8 p-6 md:p-8 rounded-lg bg-accent text-onaccent"
                                                    href="/docs/getting-started"
                                                >
                                                    <span class="lab">NEW TO GALLEO?</span>
                                                    <h2 class="sec-title text-3xl mt-3">
                                                        Create your first piece{" "}
                                                        <Icon
                                                            name="chevronRight"
                                                            size={24}
                                                            class="inline-block align-middle"
                                                        />
                                                    </h2>
                                                    <p class="mt-3">
                                                        A practical path from template or brief to a
                                                        reviewed, shareable result.
                                                    </p>
                                                </a>
                                                <For each={groups}>
                                                    {(group) => (
                                                        <section class="mt-12">
                                                            <h2 class="sec-title text-2xl mb-5">
                                                                {group}
                                                            </h2>
                                                            <div class="grid md:grid-cols-2 gap-4">
                                                                <For
                                                                    each={DOC_ARTICLES.filter(
                                                                        (article) =>
                                                                            article.group === group,
                                                                    )}
                                                                >
                                                                    {(article) => (
                                                                        <a
                                                                            href={`/docs/${article.slug}`}
                                                                            class="docs-card border border-line rounded-lg bg-panel p-6"
                                                                        >
                                                                            <h3 class="font-bold text-lg">
                                                                                {article.title}{" "}
                                                                                <Icon
                                                                                    name="chevronRight"
                                                                                    size={18}
                                                                                    class="inline-block align-middle text-muted"
                                                                                />
                                                                            </h3>
                                                                            <p class="mt-3 text-sm leading-relaxed text-soft">
                                                                                {
                                                                                    article.description
                                                                                }
                                                                            </p>
                                                                        </a>
                                                                    )}
                                                                </For>
                                                            </div>
                                                        </section>
                                                    )}
                                                </For>
                                            </>
                                        }
                                    >
                                        {(article) => (
                                            <>
                                                <Show when={article().steps.length}>
                                                    <section class="mt-9 p-6 border border-line rounded-lg bg-panel">
                                                        <h2 class="font-bold">The workflow</h2>
                                                        <ol class="list-decimal pl-5 mt-4 space-y-3 text-soft">
                                                            <For each={article().steps}>
                                                                {(step) => <li>{step}</li>}
                                                            </For>
                                                        </ol>
                                                    </section>
                                                </Show>
                                                <nav
                                                    aria-label="On this page"
                                                    class="my-9 border-y border-line py-5"
                                                >
                                                    <p class="lab text-muted mb-3">On this page</p>
                                                    <ul class="space-y-2">
                                                        <For each={article().sections}>
                                                            {(section) => (
                                                                <li>
                                                                    <a
                                                                        href={`#${section.id}`}
                                                                        class="text-accent underline underline-offset-4"
                                                                    >
                                                                        {section.heading}
                                                                    </a>
                                                                </li>
                                                            )}
                                                        </For>
                                                    </ul>
                                                </nav>
                                                <For each={article().sections}>
                                                    {(section) => (
                                                        <section
                                                            id={section.id}
                                                            class="docs-section mt-10"
                                                        >
                                                            <h2 class="sec-title text-2xl md:text-3xl">
                                                                {section.heading}
                                                            </h2>
                                                            <p class="mt-4 text-soft leading-loose max-w-200">
                                                                {section.body}
                                                            </p>
                                                        </section>
                                                    )}
                                                </For>
                                                <Show when={article().slug === "privacy-security"}>
                                                    <p class="mt-6 flex gap-6">
                                                        <a
                                                            href="/privacy"
                                                            class="text-accent underline"
                                                        >
                                                            Privacy Policy
                                                        </a>
                                                        <a
                                                            href="/terms"
                                                            class="text-accent underline"
                                                        >
                                                            Terms of Service
                                                        </a>
                                                    </p>
                                                </Show>
                                                <nav
                                                    aria-label="Continue reading"
                                                    class="mt-14 pt-7 border-t border-line grid sm:grid-cols-2 gap-5"
                                                >
                                                    <Show when={previous()}>
                                                        {(item) => (
                                                            <a
                                                                href={`/docs/${item().slug}`}
                                                                class="docs-card rounded-lg border border-line p-5"
                                                            >
                                                                <span class="lab text-muted">
                                                                    Previous
                                                                </span>
                                                                <p class="font-bold mt-2">
                                                                    {item().title}
                                                                </p>
                                                            </a>
                                                        )}
                                                    </Show>
                                                    <Show when={next()}>
                                                        {(item) => (
                                                            <a
                                                                href={`/docs/${item().slug}`}
                                                                class="docs-card rounded-lg border border-line p-5"
                                                            >
                                                                <span class="lab text-muted">
                                                                    Next
                                                                </span>
                                                                <p class="font-bold mt-2">
                                                                    {item().title}
                                                                </p>
                                                            </a>
                                                        )}
                                                    </Show>
                                                </nav>
                                            </>
                                        )}
                                    </Show>
                                </>
                            }
                        >
                            <h1 class="sec-title text-3xl">Search the guide</h1>
                            <p role="status" class="mt-3 text-muted">
                                {results().length} matching guides
                            </p>
                            <ul class="mt-6 space-y-4">
                                <For each={results()}>
                                    {(article) => (
                                        <li>
                                            <a
                                                href={`/docs/${article.slug}`}
                                                class="docs-card block rounded-lg border border-line p-6"
                                            >
                                                <p class="lab text-accent">{article.group}</p>
                                                <h2 class="text-xl font-bold mt-2">
                                                    {article.title}
                                                </h2>
                                                <p class="text-soft mt-2">{article.description}</p>
                                            </a>
                                        </li>
                                    )}
                                </For>
                            </ul>
                            <Show when={!results().length}>
                                <p class="mt-6 text-soft">
                                    Try a shorter phrase such as “export”, “voice”, or “sharing”.
                                    Clear the search to browse every guide.
                                </p>
                            </Show>
                        </Show>
                        <footer class="mt-16 border-t border-line pt-7 flex flex-wrap gap-5 text-sm text-muted">
                            <a href="/">Galleo</a>
                            <a href="/docs">Guide overview</a>
                            <a href="/#pricing">Pricing</a>
                            <a href="/privacy">Privacy</a>
                            <a href="/terms">Terms</a>
                        </footer>
                    </main>
                </div>
            </div>
        </UiThemeProvider>
    );
};
