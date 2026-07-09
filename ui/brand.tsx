import type { Component } from "solid-js";

// Galleo brand mark — a variation of the theme-reactive favicon (see app/theme.ts `setFavicon`): the
// accent badge with a serif "G" in the on-accent ink. Styling flows through theme CSS-var utilities
// (bg-accent, text-onaccent) + the theme radius, so the mark recolors with the active theme exactly as
// the favicon does. Used as the workspace/brand logo across the app (sidebar wordmark + workspace card).

type Rounded = "md" | "lg" | "xl" | "full";
const ROUNDED: Record<Rounded, string> = {
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
};

// The favicon glyph is set in a serif face; keep the mark on the same face (not the theme body font) so
// the logo reads identically wherever the theme's fonts change.
const SERIF = "Georgia, 'Times New Roman', serif";

export const Mark: Component<{ size?: number; rounded?: Rounded; class?: string }> = (props) => {
    const size = (): number => props.size ?? 28;
    return (
        <span
            aria-label="Galleo"
            class={`grid flex-none place-items-center bg-accent font-bold text-onaccent select-none ${ROUNDED[props.rounded ?? "lg"]} ${props.class ?? ""}`}
            style={{
                width: `${size()}px`,
                height: `${size()}px`,
                "font-family": SERIF,
                "font-size": `${Math.round(size() * 0.62)}px`,
                "line-height": "1",
            }}
        >
            G
        </span>
    );
};
