import type { Component, JSX } from "solid-js";

// Minimal line icons (24×24, currentColor) for the studio rail + chrome. Bars/fills opt out of stroke.
const PATHS: Record<string, JSX.Element> = {
    search: (
        <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="20.5" y1="20.5" x2="15.4" y2="15.4" />
        </>
    ),
    inspector: (
        <>
            <path d="M4 8h16M4 16h16" />
            <circle cx="10" cy="8" r="2.3" fill="var(--color-panel)" />
            <circle cx="15" cy="16" r="2.3" fill="var(--color-panel)" />
        </>
    ),
    text: <path d="M6 6h12M12 6v12M9.5 18h5" />,
    media: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8" cy="10" r="1.6" />
            <path d="M21 16l-4.6-4.6L6 19" />
        </>
    ),
    data: (
        <>
            <path d="M4 20h16" />
            <rect x="6.4" y="12" width="2.8" height="6" rx="0.8" fill="currentColor" stroke="none" />
            <rect x="10.6" y="8" width="2.8" height="10" rx="0.8" fill="currentColor" stroke="none" />
            <rect x="14.8" y="14" width="2.8" height="4" rx="0.8" fill="currentColor" stroke="none" />
        </>
    ),
    interactive: <path d="M6 4l4.6 14 2.3-5.6L18.5 9.8z" />,
    branding: (
        <>
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z" />
            <circle cx="8" cy="8" r="1.3" />
        </>
    ),
    layout: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9.5h18M9 9.5V20" />
        </>
    ),
    decoration: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
        </>
    ),
    container: (
        <>
            <rect x="8" y="3" width="13" height="13" rx="2" />
            <path d="M16 21H5a2 2 0 0 1-2-2V8" />
        </>
    ),
    sections: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
        </>
    ),
};

export const Icon: Component<{ name: string; size?: number }> = (props) => (
    <svg
        width={props.size ?? 18}
        height={props.size ?? 18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        {PATHS[props.name]}
    </svg>
);
