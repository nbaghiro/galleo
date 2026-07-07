import type { Component, JSX } from "solid-js";
import { resolveTheme } from "@themes";
import { appTheme } from "../theme";

// Theme-reactive icon style: the active app theme's character drives the line work, so icons restyle
// when the theme changes — heavy + square for bold/brutalist themes, thin + round for refined ones.
type IcoStyle = { sw: number; cap: "round" | "square"; join: "round" | "miter" };
export function iconStyle(): IcoStyle {
    const t = resolveTheme(appTheme()).tokens;
    const sw = t.headingWeight >= 700 ? 2.4 : t.headingWeight <= 500 ? 1.5 : 1.9;
    const round = t.radius >= 12;
    return { sw, cap: round ? "round" : "square", join: round ? "round" : "miter" };
}

const Ico: Component<{ children: JSX.Element; size?: number }> = (props) => (
    <svg
        width={props.size ?? 17}
        height={props.size ?? 17}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={iconStyle().sw}
        stroke-linecap={iconStyle().cap}
        stroke-linejoin={iconStyle().join}
        aria-hidden="true"
    >
        {props.children}
    </svg>
);

type P = { size?: number };

export const LibraryIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <rect x="3" y="3" width="7.5" height="7.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" />
    </Ico>
);

export const TemplatesIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <rect x="3" y="4" width="18" height="16" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="9" x2="9" y2="20" />
    </Ico>
);

export const SharedIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <circle cx="18" cy="5" r="2.6" />
        <circle cx="6" cy="12" r="2.6" />
        <circle cx="18" cy="19" r="2.6" />
        <line x1="8.3" y1="10.7" x2="15.7" y2="6.3" />
        <line x1="8.3" y1="13.3" x2="15.7" y2="17.7" />
    </Ico>
);

export const TrashIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </Ico>
);

export const PlusIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </Ico>
);

export const DeckIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <rect x="2.5" y="5.5" width="19" height="13" />
        <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
    </Ico>
);

export const DocIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v4h4" />
        <line x1="8.5" y1="13" x2="15.5" y2="13" />
        <line x1="8.5" y1="16.5" x2="13" y2="16.5" />
    </Ico>
);

export const SiteIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <rect x="3" y="4" width="18" height="16" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="6.5" y1="6.5" x2="6.6" y2="6.5" />
        <line x1="9" y1="6.5" x2="9.1" y2="6.5" />
    </Ico>
);

export const SparkleIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M12 3l1.7 5.1a2 2 0 0 0 1.2 1.2L20 11l-5.1 1.7a2 2 0 0 0-1.2 1.2L12 19l-1.7-5.1a2 2 0 0 0-1.2-1.2L4 11l5.1-1.7a2 2 0 0 0 1.2-1.2z" />
    </Ico>
);

export const SignOutIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </Ico>
);

export const SearchIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </Ico>
);

export const DuplicateIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <rect x="9" y="9" width="11" height="11" rx="2.5" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Ico>
);

export const RestoreIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M4 10a8 8 0 1 0 2.5-4.2" />
        <polyline points="3 3 3 9 9 9" />
    </Ico>
);

export const RefreshIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
    </Ico>
);

export const FolderIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Ico>
);

// filled folder (colorable via `color`) — used for the unique per-folder color in the sidebar
export const FolderFillIcon: Component<P> = (p) => (
    <svg
        width={p.size ?? 17}
        height={p.size ?? 17}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M3 7.2A1.8 1.8 0 0 1 4.8 5.4h3.3a1.8 1.8 0 0 1 1.4.66l.74.92a1 1 0 0 0 .78.37H19.2A1.8 1.8 0 0 1 21 9.12V17.8a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.8z" />
    </svg>
);

export const ChevronRightIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <polyline points="9 6 15 12 9 18" />
    </Ico>
);

export const ChevronLeftIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <polyline points="15 6 9 12 15 18" />
    </Ico>
);

export const ChevronDownIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <polyline points="6 9 12 15 18 9" />
    </Ico>
);

export const ChevronUpIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <polyline points="6 15 12 9 18 15" />
    </Ico>
);

export const CloseIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M6 6 18 18M18 6 6 18" />
    </Ico>
);

export const EditIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <path d="M13.5 6.5 17.5 10.5M4 20l1-4L15 6l3 3L8 19z" />
    </Ico>
);

export const MoreIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Ico>
);

export const CheckIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <polyline points="5 12.5 10 17 19 7" />
    </Ico>
);

export const ArrowUpRightIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="9 7 17 7 17 15" />
    </Ico>
);

export const ThemeIcon: Component<P> = (p) => (
    <Ico size={p.size}>
        <circle cx="13.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="6.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
        <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </Ico>
);
