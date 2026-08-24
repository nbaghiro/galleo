import type { Component } from "solid-js";
import type { Tokens } from "@themes";

type Rounded = "md" | "lg" | "xl" | "full";
const ROUNDED: Record<Rounded, string> = {
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
};

// The mark's own face, not the theme body font; setFavicon draws the same glyph in it.
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

// The same mark as the tab icon, redrawn as an SVG data URI so it recolors with the theme. Here
// rather than in a store because every surface that paints a favicon needs it: the app, the public
// viewer, and the marketing page.
export function setFavicon(tokens: Tokens): void {
    const rx = Math.max(1.5, Math.min(9, tokens.radius * 0.42)).toFixed(2);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<rect width="32" height="32" rx="${rx}" fill="${tokens.accent}"/>` +
        `<text x="16.5" y="23.3" font-family="${SERIF}" font-size="23" ` +
        `font-weight="700" fill="${tokens.onAccent}" text-anchor="middle">G</text>` +
        `</svg>`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
