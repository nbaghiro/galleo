// Every model id in the registry must be one the installed provider package still declares.
//
// The providers type their ids as a literal union ending in `| (string & {})`, so a retired or
// invented id typechecks cleanly and fails only at the API, as a 404 on somebody's turn. That is how
// `xai:grok-4` sat in the registry after the SDK had moved to the 4.x line.
//
// Self-checking: a regex that silently matches nothing would pass this file forever, so it asserts it
// actually parsed each union and actually read the registry before judging anything.

import { readFileSync } from "node:fs";

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
const entries = [...registry.matchAll(/provider: "(\w+)",\n\s*model: "([^"]+)"/g)].map((m) => ({
    provider: m[1],
    model: m[2],
}));

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
        if (!stale.length)
            w(`✓ all ${entries.length} model ids are declared by their provider package`);
    }
}
