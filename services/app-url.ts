// Absolute URL on the app origin (APP_URL) — email links and OAuth redirects must be clickable from
// outside the app, so they can't be relative.
export function appUrl(path: string): string {
    const base = process.env.APP_URL?.trim() || "http://localhost:8600";
    return `${base}${path}`;
}
