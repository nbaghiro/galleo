// Themes are data: a token set applied across every block of an artifact.

export interface Tokens {
    fontDisplay: string;
    fontUi: string;
    fontMono: string;
    radius: number;
    radiusLarge: number;
    headingWeight: number;
}

export interface Theme {
    id: string;
    name: string;
    isDark: boolean;
    mood: "calm" | "bold";
    tokens: Tokens;
    colors: Record<string, string>;
}
