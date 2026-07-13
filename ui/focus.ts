const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

export function focusables(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute("aria-hidden") !== "true" && !el.hidden,
    );
}

export function trapFocus(container: HTMLElement): () => void {
    const prev = document.activeElement as HTMLElement | null;
    const initial =
        container.querySelector<HTMLElement>("[autofocus]") ??
        focusables(container)[0] ??
        container;
    initial.focus?.();
    const onKey = (e: KeyboardEvent): void => {
        if (e.key !== "Tab") return;
        const items = focusables(container);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };
    container.addEventListener("keydown", onKey);
    return () => {
        container.removeEventListener("keydown", onKey);
        prev?.focus?.();
    };
}
