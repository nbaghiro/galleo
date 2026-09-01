// Every model id in the registry must be one the installed provider package still declares, and must
// have been answered by a real call recently.
//
// The providers type their ids as a literal union ending in `| (string & {})`, so a retired or
// invented id typechecks cleanly and fails only at the API, as a 404 on somebody's turn. That is how
// `xai:grok-4` sat in the registry after the SDK had moved to the 4.x line.
//
// Declaring an id is not the same as serving it. `gemini-3.6-flash` was declared, priced, and
// listed in the picker while 400ing on every call, because nothing had ever called it: the options
// we send were wrong for that model and only a real request could say so. So each entry also carries
// `probedOn`, and `pnpm ai:probe` is what sets it.
//
// Self-checking: a regex that silently matches nothing would pass this file forever, so it asserts it
// actually parsed each union and actually read the registry before judging anything.

import { readFileSync } from "node:fs";

const MAX_PROBE_AGE_DAYS = 180;

const TYPES = {
    anthropic: ["AnthropicModelId"],
    openai: ["OpenAIResponsesModelId", "OpenAIChatModelId"],
    google: ["GoogleModelId"],
    xai: ["XaiChatModelId"],
};

const w = (s) => process.stdout.write(`${s}\n`);
const fail = (s) => {
    process.stderr.write(`${s}\n`);
    process.exitCode = 1;
};

const declared = (provider) => {
    const src = readFileSync(`node_modules/@ai-sdk/${provider}/dist/index.d.ts`, "utf8");
    for (const name of TYPES[provider]) {
        const line = new RegExp(`^type ${name} = (.+?);$`, "m").exec(src);
        if (line) {
            const ids = [...line[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
            if (ids.length) return new Set(ids);
        }
    }
    return null;
};

const registry = readFileSync("services/core/models.ts", "utf8");
const entries = [
    ...registry.matchAll(/provider: "(\w+)",\n\s*model: "([^"]+)"[\s\S]*?probedOn: "([^"]+)"/g),
].map((m) => ({ provider: m[1], model: m[2], probedOn: m[3] }));

if (entries.length < 2) {
    fail(`✗ read ${entries.length} models from services/core/models.ts — the parser has drifted`);
} else {
    const unions = {};
    for (const provider of Object.keys(TYPES)) {
        const ids = declared(provider);
        if (!ids)
            fail(`✗ could not read the declared ids for ${provider} — the parser has drifted`);
        unions[provider] = ids;
    }

    if (!process.exitCode) {
        const stale = entries.filter((e) => unions[e.provider] && !unions[e.provider].has(e.model));
        for (const e of stale)
            fail(
                `✗ ${e.provider}:${e.model} is not declared by @ai-sdk/${e.provider} — check the id, or update the package`,
            );

        const today = new Date();
        const ageDays = (iso) => Math.floor((today - new Date(iso)) / 86_400_000);
        const cmd = (e) => `pnpm ai:probe --model=${e.provider}:${e.model} --json`;

        const unreadable = entries.filter(
            (e) => e.probedOn !== "unprobed" && Number.isNaN(new Date(e.probedOn).getTime()),
        );
        // Never probed is recorded debt: a provider whose key this environment lacks cannot be
        // probed at all, and that must not wedge every commit on unrelated work. An AGED probe is
        // drift, and drift is what silently breaks a model, so that fails.
        const unprobed = entries.filter((e) => e.probedOn === "unprobed");
        const aged = entries.filter(
            (e) =>
                e.probedOn !== "unprobed" &&
                !Number.isNaN(new Date(e.probedOn).getTime()) &&
                ageDays(e.probedOn) > MAX_PROBE_AGE_DAYS,
        );

        for (const e of unreadable)
            fail(`✗ ${e.provider}:${e.model} has an unreadable probedOn ("${e.probedOn}")`);
        for (const e of unprobed)
            w(`! ${e.provider}:${e.model} has never been probed — run ${cmd(e)} and set probedOn`);
        for (const e of aged)
            fail(
                `✗ ${e.provider}:${e.model} was last probed ${ageDays(e.probedOn)} days ago (limit ${MAX_PROBE_AGE_DAYS}) — run ${cmd(e)} and update probedOn`,
            );

        if (process.exitCode) {
            fail(
                `\n  A declared id is not a served one: the provider can retire it, or reject the options we\n  send it, and neither shows up until somebody's turn 400s. Probe it, then date it.`,
            );
        } else {
            const probed = entries.filter((e) => e.probedOn !== "unprobed");
            const oldest = probed.length
                ? probed.reduce((a, b) => (ageDays(a.probedOn) > ageDays(b.probedOn) ? a : b))
                : null;
            w(
                `✓ all ${entries.length} model ids are declared by their provider package` +
                    (oldest
                        ? `, ${probed.length} probed within ${MAX_PROBE_AGE_DAYS} days (oldest: ${oldest.provider}:${oldest.model}, ${ageDays(oldest.probedOn)} days)`
                        : "") +
                    (unprobed.length ? `, ${unprobed.length} never probed (see above)` : ""),
            );
        }
    }
}
