// Engine-native rich-text core (Path B). The engine owns text layout everywhere; a hidden
// contenteditable is only an input/IME sink. v1 is Latin-first, desktop-first.

export type MarkType = "b" | "i" | "u" | "s" | "code" | "link" | "color" | "hl";

export interface Mark {
    from: number;
    to: number;
    type: MarkType;
    value?: string; // href for link, hex for color/hl
}

export interface Para {
    text: string;
    marks: Mark[];
    align?: "start" | "center" | "end";
}

export type TextStyle = "display" | "h1" | "h2" | "body" | "eyebrow" | "quote" | "caption";

export interface TextContent {
    paras: Para[];
    style: TextStyle;
    multiline: boolean;
}
