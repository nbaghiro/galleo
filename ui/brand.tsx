import type { Component } from "solid-js";

// Brand mark — keep in sync with the theme-reactive favicon (app/theme.ts setFavicon).

type Rounded = "md" | "lg" | "xl" | "full";
const ROUNDED: Record<Rounded, string> = {
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
};

// Serif to match the favicon glyph, not the theme body font.
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
