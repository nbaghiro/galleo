import { createSignal } from "solid-js";

// Mirrors Tailwind's default scale: the `md:`/`lg:` utilities and these signals must stay in sync.
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export type Tier = "phone" | "tablet" | "desktop";

export function tierFor(width: number): Tier {
    if (width < BREAKPOINTS.md) return "phone";
    if (width < BREAKPOINTS.lg) return "tablet";
    return "desktop";
}

// Tier policy (.docs/frontend.md). Every surface now runs on every tier: manipulate shipped its
// phone chrome (bottom sheets over the full-bleed canvas), so the tier decides layout, not access.
// The seam stays so a surface could be re-gated without touching its call sites.
export type Surface = "consume" | "manage" | "manipulate";

export function surfaceAllowed(_surface: Surface, _tier: Tier): boolean {
    return true;
}

const COARSE = "(pointer: coarse)";
const REDUCED = "(prefers-reduced-motion: reduce)";

const initialWidth = (): number =>
    typeof window === "undefined" ? BREAKPOINTS.xl : window.innerWidth;

const matches = (q: string): boolean =>
    typeof window !== "undefined" && (window.matchMedia?.(q).matches ?? false);

const [tier, setTier] = createSignal<Tier>(tierFor(initialWidth()));
const [coarse, setCoarse] = createSignal(matches(COARSE));
const [reduced, setReduced] = createSignal(matches(REDUCED));

export const viewportTier = tier;
export const isPhone = (): boolean => tier() === "phone";
export const isDesktop = (): boolean => tier() === "desktop";
// Coarse pointer means touch-sized hit targets, not a narrow viewport: a tablet is both.
export const isCoarsePointer = coarse;
// Playback motion stands down entirely under this, rather than running shortened.
export const prefersReducedMotion = reduced;

export const canEditHere = (): boolean => surfaceAllowed("manipulate", tier());

// Listen on the tier boundaries, not `resize`: once per crossing instead of once per drag frame.
if (typeof window !== "undefined" && window.matchMedia) {
    const watched = [
        window.matchMedia(`(min-width: ${BREAKPOINTS.md}px)`),
        window.matchMedia(`(min-width: ${BREAKPOINTS.lg}px)`),
        window.matchMedia(COARSE),
        window.matchMedia(REDUCED),
    ];
    const sync = (): void => {
        setTier(tierFor(window.innerWidth));
        setCoarse(matches(COARSE));
        setReduced(matches(REDUCED));
    };
    for (const m of watched) m.addEventListener("change", sync);
}
