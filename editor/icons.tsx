import type { Component, JSX } from "solid-js";
import { editorTokens } from "./editor";

// Minimal line icons (24×24, currentColor) for the studio rail + chrome. Bars/fills opt out of stroke.
const PATHS: Record<string, () => JSX.Element> = {
    search: () => (
        <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="20.5" y1="20.5" x2="15.4" y2="15.4" />
        </>
    ),
    inspector: () => (
        <>
            <path d="M4 8h16M4 16h16" />
            <circle cx="10" cy="8" r="2.3" fill="currentColor" stroke="none" />
            <circle cx="15" cy="16" r="2.3" fill="currentColor" stroke="none" />
        </>
    ),
    text: () => <path d="M6 6h12M12 6v12M9.5 18h5" />,
    lock: () => (
        <>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
    ),
    media: () => (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8" cy="10" r="1.6" />
            <path d="M21 16l-4.6-4.6L6 19" />
        </>
    ),
    data: () => (
        <>
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M4 10h16M10 5v14" />
        </>
    ),
    chart: () => (
        <>
            <path d="M4 20h16" />
            <rect
                x="6.4"
                y="12"
                width="2.8"
                height="6"
                rx="0.8"
                fill="currentColor"
                stroke="none"
            />
            <rect
                x="10.6"
                y="8"
                width="2.8"
                height="10"
                rx="0.8"
                fill="currentColor"
                stroke="none"
            />
            <rect
                x="14.8"
                y="14"
                width="2.8"
                height="4"
                rx="0.8"
                fill="currentColor"
                stroke="none"
            />
        </>
    ),
    diagram: () => (
        <>
            <rect x="3.5" y="9" width="6" height="6" rx="1.4" />
            <rect x="14.5" y="4" width="6" height="6" rx="1.4" />
            <rect x="14.5" y="14" width="6" height="6" rx="1.4" />
            <path d="M9.5 12h3M12.5 12V7h2M12.5 12v5h2" />
        </>
    ),
    interactive: () => <path d="M6 4l4.6 14 2.3-5.6L18.5 9.8z" />,
    branding: () => (
        <>
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z" />
            <circle cx="8" cy="8" r="1.3" />
        </>
    ),
    layout: () => (
        <>
            <rect x="3.5" y="4" width="7" height="8.5" rx="1.4" fill="currentColor" stroke="none" />
            <rect x="13.5" y="4" width="7" height="5" rx="1.4" fill="currentColor" stroke="none" />
            <rect
                x="13.5"
                y="11.5"
                width="7"
                height="8.5"
                rx="1.4"
                fill="currentColor"
                stroke="none"
            />
            <rect x="3.5" y="15" width="7" height="5" rx="1.4" fill="currentColor" stroke="none" />
        </>
    ),
    decoration: () => (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
        </>
    ),
    container: () => (
        <>
            <rect x="8" y="3" width="13" height="13" rx="2" />
            <path d="M16 21H5a2 2 0 0 1-2-2V8" />
        </>
    ),
    sections: () => (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
        </>
    ),
    present: () => <path d="M7 4.5 20 12 7 19.5z" fill="currentColor" stroke="none" />,
    preview: () => (
        <>
            <path d="M15 3h6v6M21 3l-7.5 7.5" />
            <path d="M9 21H3v-6M3 21l7.5-7.5" />
        </>
    ),
    export: () => (
        <>
            <path d="M21 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-4.5" />
            <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
        </>
    ),
    chevron: () => <path d="M5.5 8.5 12 15l6.5-6.5" />,
    undo: () => (
        <>
            <path d="M9 7 4 12l5 5" />
            <path d="M4 12h10a5 5 0 0 1 0 10h-2" />
        </>
    ),
    redo: () => (
        <>
            <path d="M15 7l5 5-5 5" />
            <path d="M20 12H10a5 5 0 0 0 0 10h2" />
        </>
    ),
    // container layout controls (group/card bar)
    columns: () => (
        <>
            <rect x="4" y="5" width="16" height="14" rx="1.5" />
            <path d="M9.3 5v14M14.7 5v14" />
        </>
    ),
    stack: () => <path d="M5 7h14M5 12h14M5 17h14" />, // direction: children stacked (column)
    row: () => <path d="M7 5v14M12 5v14M17 5v14" />, // direction: children in a row
    distStart: () => (
        <>
            <rect x="5" y="4" width="14" height="16" rx="2" opacity="0.35" />
            <path d="M8 7.5h8M8 10.5h8" />
        </>
    ),
    distCenter: () => (
        <>
            <rect x="5" y="4" width="14" height="16" rx="2" opacity="0.35" />
            <path d="M8 10.5h8M8 13.5h8" />
        </>
    ),
    distEnd: () => (
        <>
            <rect x="5" y="4" width="14" height="16" rx="2" opacity="0.35" />
            <path d="M8 13.5h8M8 16.5h8" />
        </>
    ),
    // align (cross-axis): items hug a start/center/end guide — distinct from the text-align self-align
    alignItemsStart: () => (
        <>
            <path d="M4.5 4v16" />
            <rect x="7.5" y="7" width="10" height="3.4" rx="1" fill="currentColor" stroke="none" />
            <rect
                x="7.5"
                y="13.6"
                width="6.5"
                height="3.4"
                rx="1"
                fill="currentColor"
                stroke="none"
            />
        </>
    ),
    alignItemsCenter: () => (
        <>
            <path d="M12 4v16" />
            <rect x="7" y="7" width="10" height="3.4" rx="1" fill="currentColor" stroke="none" />
            <rect
                x="8.75"
                y="13.6"
                width="6.5"
                height="3.4"
                rx="1"
                fill="currentColor"
                stroke="none"
            />
        </>
    ),
    alignItemsEnd: () => (
        <>
            <path d="M19.5 4v16" />
            <rect x="6.5" y="7" width="10" height="3.4" rx="1" fill="currentColor" stroke="none" />
            <rect
                x="10"
                y="13.6"
                width="6.5"
                height="3.4"
                rx="1"
                fill="currentColor"
                stroke="none"
            />
        </>
    ),
    chevronLeft: () => <path d="M14 6l-6 6 6 6" />,
    chevronRight: () => <path d="M10 6l6 6-6 6" />,
    grid: () => <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
    fullscreen: () => <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />,
    close: () => <path d="M6 6l12 12M18 6 6 18" />,
    sparkle: () => <path d="M12 4.5 13.5 10l5.5 1.5-5.5 1.5L12 18.5 10.5 13 5 11.5 10.5 10z" />,
    chevronUp: () => <path d="M6 14l6-6 6 6" />,
    chevronDown: () => <path d="M6 10l6 6 6-6" />,
    plus: () => <path d="M12 5v14M5 12h14" />,
    duplicate: () => (
        <>
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </>
    ),
    trash: () => (
        <>
            <path d="M4 7h16" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
        </>
    ),
    alignLeft: () => <path d="M4 6h16M4 12h10M4 18h13" />,
    alignCenter: () => <path d="M4 6h16M7 12h10M5 18h14" />,
    alignRight: () => <path d="M4 6h16M10 12h10M7 18h13" />,
    grip: () => (
        <>
            <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
        </>
    ),
    code: () => <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
    link: () => (
        <>
            <path d="M10 13a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
            <path d="M14 11a4 4 0 0 0-5.66 0L5.5 13.83a4 4 0 0 0 5.66 5.66l1.5-1.5" />
        </>
    ),
    bold: () => <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a4 4 0 0 1 0 7H7z" />,
    italic: () => <path d="M10 5h7M7 19h7M15 5l-4 14" />,
    underline: () => <path d="M7 5v6a5 5 0 0 0 10 0V5M6 20h12" />,
    strike: () => <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />,
    letterA: () => <path d="M6 19l6-14 6 14M8.5 13.5h7" />,
    highlighter: () => (
        <>
            <path d="M9 11l-6 6v3h9l3-3" />
            <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z" />
        </>
    ),
    zoom: () => (
        <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="20.5" y1="20.5" x2="15.4" y2="15.4" />
            <path d="M10.5 8v5M8 10.5h5" />
        </>
    ),
    corner: () => <path d="M5 19v-8a6 6 0 0 1 6-6h8" />,
};

// Icon line-weight/cap derive from the active artifact theme — heavier + square for bold/brutalist
// themes, thin + round for refined ones — so the chrome icons match the deck's character.
function iconStyle(): { sw: number; cap: "round" | "square"; join: "round" | "miter" } {
    const t = editorTokens();
    const sw = t.headingWeight >= 700 ? 2.2 : t.headingWeight <= 500 ? 1.5 : 1.8;
    const round = t.radius >= 12;
    return { sw, cap: round ? "round" : "square", join: round ? "round" : "miter" };
}

export const Icon: Component<{ name: string; size?: number }> = (props) => (
    <svg
        width={props.size ?? 18}
        height={props.size ?? 18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={iconStyle().sw}
        stroke-linecap={iconStyle().cap}
        stroke-linejoin={iconStyle().join}
        aria-hidden="true"
    >
        {PATHS[props.name]?.()}
    </svg>
);
