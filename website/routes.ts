// Which page of the marketing build a path serves. Pure, so main.tsx keeps only the bootstrapping,
// and mirrored in two other places that must agree with it: the production routes in
// services/server.ts and the dev fallback in vite.config.ts. A path missing from either of those
// falls through to the app SPA, which is how localhost and production start disagreeing.

export const LEGAL_DOC_IDS = ["privacy", "terms"] as const;

export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

export const LEGAL_PATHS: Record<LegalDocId, string> = {
    privacy: "/privacy",
    terms: "/terms",
};

/** The legal document a path serves, or null when the path is not one of them. */
export function legalDocFor(pathname: string): LegalDocId | null {
    // a pasted link often carries a trailing slash; the server accepts both forms too
    const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return LEGAL_DOC_IDS.find((id) => LEGAL_PATHS[id] === path) ?? null;
}
