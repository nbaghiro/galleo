// Every price in the model registry must have been checked against the provider recently.
//
// check:models proves an id still EXISTS; nothing proved its PRICE was right, which is how
// `claude-sonnet-5` sat at Sonnet 4.6's rate and billed every run through it 50% high, and how the
// cheaper Gemini Flash models went unnoticed for months. A price is not something that fails loudly:
// it just quietly charges the wrong number, so it needs a clock on it.
//
// Self-checking: a regex that silently matched nothing would pass this file forever, so it asserts
// it actually read both registries, and that every entry it read carries a date it can parse.

import { readFileSync } from "node:fs";

const MAX_AGE_DAYS = 90;

const SOURCES = {
    anthropic: "https://claude.com/pricing#api",
    openai: "https://openai.com/api/pricing/",
    google: "https://ai.google.dev/gemini-api/docs/pricing",
    xai: "https://docs.x.ai/docs/models",
    media: "https://ai.google.dev/gemini-api/docs/pricing (images, video) · https://elevenlabs.io/pricing (speech, music)",
};

const w = (s) => process.stdout.write(`${s}\n`);
const fail = (s) => {
    process.stderr.write(`${s}\n`);
    process.exitCode = 1;
};

const src = readFileSync("services/core/models.ts", "utf8");

// text models: provider + model id + the date, in registry order
const text = [
    ...src.matchAll(/provider: "(\w+)",\s*\n\s*model: "([^"]+)",[\s\S]*?pricedOn: "([^"]+)"/g),
].map((m) => ({ provider: m[1], id: m[2], pricedOn: m[3] }));

// media models: the id line and the date that follows it inside the same literal
const media = [
    ...src.matchAll(/id: ([A-Z_]+|"[^"]+"),\s*\n\s*label: "[^"]+",[\s\S]*?pricedOn: "([^"]+)"/g),
].map((m) => ({ provider: "media", id: m[1].replace(/"/g, ""), pricedOn: m[2] }));

const entries = [...text, ...media];

if (text.length < 2 || media.length < 2) {
    fail(
        `✗ read ${text.length} text and ${media.length} media prices from services/core/models.ts — the parser has drifted`,
    );
} else {
    const today = new Date();
    const ageDays = (iso) => Math.floor((today - new Date(iso)) / 86_400_000);

    const unverified = entries.filter((e) => e.pricedOn === "unverified");
    const undated = entries.filter(
        (e) => e.pricedOn !== "unverified" && Number.isNaN(new Date(e.pricedOn).getTime()),
    );
    const stale = entries.filter(
        (e) =>
            e.pricedOn !== "unverified" &&
            !Number.isNaN(new Date(e.pricedOn).getTime()) &&
            ageDays(e.pricedOn) > MAX_AGE_DAYS,
    );

    for (const e of undated)
        fail(`✗ ${e.provider}:${e.id} has an unreadable pricedOn ("${e.pricedOn}")`);
    // Never-checked is recorded debt, not a regression: it warns loudly but does not wedge every
    // commit on unrelated work. A date that has AGED is drift, and that fails.
    for (const e of unverified)
        w(
            `! ${e.provider}:${e.id} has never been price-checked — verify it at ${SOURCES[e.provider] ?? "the provider"} and set pricedOn`,
        );
    for (const e of stale)
        fail(
            `✗ ${e.provider}:${e.id} was priced ${ageDays(e.pricedOn)} days ago (limit ${MAX_AGE_DAYS}) — re-verify at ${SOURCES[e.provider] ?? "the provider"} and update pricedOn`,
        );

    if (process.exitCode) {
        fail(
            `\n  A wrong price bills silently: it does not throw, it just charges the wrong number of credits.\n  Check the rate, correct usd/usdPerUnit if it moved, then set pricedOn to today.`,
        );
    } else {
        const dated = entries.filter((e) => e.pricedOn !== "unverified");
        const oldest = dated.reduce((a, b) => (ageDays(a.pricedOn) > ageDays(b.pricedOn) ? a : b));
        w(
            `✓ ${dated.length} prices checked within ${MAX_AGE_DAYS} days (oldest: ${oldest.provider}:${oldest.id}, ${ageDays(oldest.pricedOn)} days)${
                unverified.length ? `, ${unverified.length} never checked (see above)` : ""
            }`,
        );
    }
}
