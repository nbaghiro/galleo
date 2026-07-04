import type { SectionBackground } from "@model/artifact";
import type { Tokens } from "@themes/theme";

// CSS `background` value for a document/section backdrop: image+scrim, gradient, color, or theme bg.
export function backdropCss(bg: SectionBackground | undefined, tokens: Tokens): string {
    if (!bg || bg.kind === "none") return tokens.bg;
    if (bg.kind === "image" && bg.image) {
        const s = bg.scrim ?? 0;
        const url = `url("${bg.image}")`;
        return s ? `linear-gradient(rgba(0,0,0,${s}),rgba(0,0,0,${s})), ${url}` : url;
    }
    if (bg.kind === "gradient" && bg.gradient) {
        return `linear-gradient(${bg.gradient.angle ?? 135}deg, ${bg.gradient.from}, ${bg.gradient.to})`;
    }
    if (bg.kind === "color" && bg.color) return bg.color;
    return tokens.bg;
}
