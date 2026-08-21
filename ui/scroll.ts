import { onCleanup } from "solid-js";

// Load-more-on-scroll, as both the library and the media picker need it: one observer re-pointed at
// whichever sentinel is currently mounted, torn down with the owning component. `root` scopes it to
// a scroll container (the picker paginates inside a modal); omitted, it watches the viewport.
export function createSentinel(
    onReach: () => void,
    opts: { root?: () => Element | null; margin?: string } = {},
): (el: Element) => void {
    let observer: IntersectionObserver | null = null;
    let current: Element | null = null;
    onCleanup(() => observer?.disconnect());
    return (el: Element): void => {
        current = el;
        observer?.disconnect();
        observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) onReach();
            },
            { root: opts.root?.() ?? null, rootMargin: opts.margin ?? "500px 0px" },
        );
        observer.observe(current);
    };
}
