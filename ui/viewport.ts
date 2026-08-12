import { createSignal } from "solid-js";

// Mirrors Tailwind's default scale: the `md:`/`lg:` utilities and these signals must stay in sync.
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export type Tier = "phone" | "tablet" | "desktop";

export function tierFor(width: number): Tier {
    if (width < BREAKPOINTS.md) return "phone";
    if (width < BREAKPOINTS.lg) return "tablet";
    return "desktop";
}

// Tier policy (.docs/frontend.md). What decides a surface is how you author, not whether you create:
// direct manipulation needs pointer precision and panel room, instructed authoring is a form and a
// result, so generation runs on a phone and canvas editing does not.
export type Surface = "consume" | "manage" | "manipulate";

export function surfaceAllowed(surface: Surface, tier: Tier): boolean {
    return surface !== "manipulate" || tier !== "phone";
}

const COARSE = "(pointer: coarse)";

const initialWidth = (): number =>
    typeof window === "undefined" ? BREAKPOINTS.xl : window.innerWidth;

const matches = (q: string): boolean =>
    typeof window !== "undefined" && (window.matchMedia?.(q).matches ?? false);

const [tier, setTier] = createSignal<Tier>(tierFor(initialWidth()));
const [coarse, setCoarse] = createSignal(matches(COARSE));

export const viewportTier = tier;
export const isPhone = (): boolean => tier() === "phone";
export const isDesktop = (): boolean => tier() === "desktop";
// Coarse pointer means touch-sized hit targets, not a narrow viewport: a tablet is both.
export const isCoarsePointer = coarse;

export const canEditHere = (): boolean => surfaceAllowed("manipulate", tier());

// Listen on the tier boundaries, not `resize`: once per crossing instead of once per drag frame.
if (typeof window !== "undefined" && window.matchMedia) {
    const watched = [
        window.matchMedia(`(min-width: ${BREAKPOINTS.md}px)`),
        window.matchMedia(`(min-width: ${BREAKPOINTS.lg}px)`),
        window.matchMedia(COARSE),
    ];
    const sync = (): void => {
        setTier(tierFor(window.innerWidth));
        setCoarse(matches(COARSE));
    };
    for (const m of watched) m.addEventListener("change", sync);
}
