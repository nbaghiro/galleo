export interface Point {
    para: number;
    offset: number; // UTF-16 offset; caret moves by grapheme via Intl.Segmenter
}

export interface Selection {
    anchor: Point;
    focus: Point;
    affinity: "up" | "down"; // disambiguates the line-wrap boundary
}
