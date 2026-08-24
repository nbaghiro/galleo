// injected once by App.tsx, since useNavigate() must run under the Router
let nav: ((path: string) => void) | null = null;

export function setNavigate(fn: (path: string) => void): void {
    nav = fn;
}

// The router does not scroll to fragments, and the target can render a beat after its data loads,
// so the anchor is polled for briefly rather than assumed present on the next frame.
function scrollToAnchor(id: string, tries = 20): void {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    if (tries > 0) window.setTimeout(() => scrollToAnchor(id, tries - 1), 50);
}

export const go = (path: string): void => {
    nav?.(path);
    const hash = path.split("#")[1];
    if (hash) scrollToAnchor(hash);
};
