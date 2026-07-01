import { PROFILES } from "@engine/profile";

// Format helpers shared across the app UI. The ordered id set is derived from the kernel's PROFILES so
// the app never restates it; the display labels live here because "Site" (for `web`) is a UI/product
// term, not the kernel's format name ("Web").

export const FORMAT_IDS = Object.keys(PROFILES); // ["deck", "doc", "web"]

export const formatLabel = (id: string): string =>
    id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck";

export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;

// Relative "…ago" timestamp for the library / trash cards.
export function relativeTime(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
    return `${Math.floor(s / 604_800)}w ago`;
}
