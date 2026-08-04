// Keyset (not offset) pagination: a cursor names the last row seen, so a concurrent edit can't make a
// row repeat or vanish between pages. The cursor is opaque to the client and cheap to validate — a
// tampered or stale one degrades to "start from the beginning" rather than an error page.

export interface Cursor {
    key: string; // the sort column's value at the last row (ISO timestamp or title)
    id: string;
}

export function encodeCursor(c: Cursor): string {
    return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
        if (!parsed || typeof parsed !== "object") return null;
        const { key, id } = parsed as Record<string, unknown>;
        return typeof key === "string" && typeof id === "string" ? { key, id } : null;
    } catch {
        return null;
    }
}

/** Clamp a client-supplied page size into a range the server is happy to serve. */
export function pageLimit(raw: string | undefined, fallback: number, max: number): number {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(max, n);
}
