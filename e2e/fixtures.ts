import { test as base, expect } from "@playwright/test";

// Shared spec plumbing: external image hosts answer with a local pixel (layout stays honest,
// network flake dies), and any pageerror / console.error fails the spec — the cheapest real-bug
// net. Add to ALLOWED_NOISE only with a comment saying why.
// Content references `/api/media/asset/:id`, which is same-origin; an adopted asset redirects out to
// one of these hosts, so the stub still catches it.
const IMAGE_HOSTS =
    /(^|\.)randomuser\.me$|(^|\.)picsum\.photos$|(^|\.)unsplash\.com$|(^|\.)images\.unsplash\.com$|(^|\.)pexels\.com$|(^|\.)pixabay\.com$/;

const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
);

const ALLOWED_NOISE: RegExp[] = [
    // the boot-time session probe: logged out, /api/me answers 401 and the app renders the auth
    // gate; the browser logs every non-2xx fetch regardless of the app handling it
    /401 \(Unauthorized\) \[[^\]]*\/api\/me\]/,
    // rapid successive commits (drop then undo) can race the debounced content save into a 409;
    // the save store rebases and retries, the browser logs the failed fetch regardless. Recorded
    // as a finding in .docs/e2e-implementation-plan.md.
    /409 \(Conflict\) \[[^\]]*\/api\/artifacts\/[^\]]*\/content\]/,
    // wrong-credential attempts in auth specs: the 401 is the asserted behavior
    /401 \(Unauthorized\) \[[^\]]*\/api\/auth\/login\]/,
    // FINDING (recorded in .docs/e2e-implementation-plan.md): the export flow fetch()es Google
    // Fonts css, which never sends CORS headers, so font inlining falls back and the browser
    // logs the block; the export itself completes
    /fonts\.googleapis\.com/,
    // transient CDN 404s on individual woff2 files; the face falls back, layout survives
    /fonts\.gstatic\.com/,
];

export const statePath = (persona: string): string =>
    `e2e/.state/${persona.replace("+", "_")}.json`;

export const test = base.extend({
    page: async ({ page }, use) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
        page.on("console", (m) => {
            if (m.type() !== "error") return;
            const text = `${m.text()} [${m.location().url}]`;
            if (!ALLOWED_NOISE.some((rx) => rx.test(text))) errors.push(`console.error: ${text}`);
        });
        // scoped by predicate: intercepting everything reissues CORS'd requests (webfont css)
        // without their CORS context and the browser then blocks the response
        await page.route(
            (url) => IMAGE_HOSTS.test(url.hostname),
            (route) => route.fulfill({ contentType: "image/png", body: PIXEL }),
        );
        await use(page);
        expect(errors, "the page logged errors during the spec").toEqual([]);
    },
});

export { expect };
