// Tool-unification guard: fails when a caller reaches around the one executor.
//
// There are three ways to run a tool (the chat agent, a direct route, the MCP server) and one
// envelope that is supposed to serve all three: services/core/ai/execute.ts, which resolves the
// tool, checks the surface, checks the granted scope, applies the plan entitlement, parses the
// input with the tool's own schema, and reserves. Every one of those was forked at some point:
//
//   - a route imported a tool body and called it, so the schema that validated an agent's
//     arguments never ran on the route's,
//   - a route called reserve() naming a tool id as a string literal, so the same tool billed
//     differently depending on who reached it,
//   - the mcp surface grew a scope check of its own keyed on `effect`, which cannot express
//     artifacts:share.
//
// What is checked:
//   1. no file under services/api/ imports a tool body from services/core/ai/tools/,
//   2. no file outside the executor calls reserve() with a tool id, except the ALLOW list below,
//   3. every tool the catalog puts on a non-internal surface resolves to a scope, and every tool
//      on the mcp surface has an implementation and a name within the directory's 64-char limit,
//   4. every tool with a registered body either carries a price or says `free: true`, so a body
//      that reaches a provider cannot bill nothing by omission.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working,
// so it plants both textual violations and fails if the scan stays quiet.
//
// Lives in scripts/ because it deliberately crosses the layer law (the model catalog and the
// services registry in one process); scripts sit outside the law, as check-elements.ts does.
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isToolScope, scopeFor, TOOLS, type ToolId } from "@model/tools";
import { registeredToolIds, toolsFor } from "@services/core/ai/tools";
import "@services/core/ai/tools/register";

const w = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

const SELF = "scripts/check-tools.ts";
const EXECUTOR = "services/core/ai/execute.ts";

// A tool body reached directly, rather than through the executor that validates and prices it.
// `import type` is exempt: a result shape is not a body, and a route naming what it will answer
// with is the opposite of reaching around the envelope.
const TOOL_BODY_IMPORT =
    /(?<!import\s+type\s+[^;]{0,200})from\s+["']@services\/core\/ai\/tools\/[^"']+["']/;
// A reserve() CALL that names a tool, which is the fork that made one tool cost two different
// things. Declarations are not calls, and a call's arguments may wrap, so this reads the text
// rather than a line and looks ahead as far as an argument list can plausibly run.
const RESERVE_CALL = /(?<!function\s)\breserve\s*\(/g;
const RESERVE_LOOKAHEAD = 240;

/**
 * The reserves that are not a tool call in disguise. Each one holds credits for work whose price
 * the catalog names but whose body is not a registered tool: synthesis and voice design run against
 * a provider rather than a model, so there is nothing for the executor to resolve. They stay listed
 * here rather than being invisible, so adding one lands in a reviewed diff.
 */
const ALLOW: Record<string, string> = {
    "services/api/narration.ts":
        "narrate-artifact + compose-soundtrack: provider calls, no registered tool body",
    // Same tool, same reason, from the background path: its notes call DOES go through the executor,
    // so this covers only the synthesis reserve beside it.
    "services/core/prepare.ts":
        "narrate-artifact + compose-soundtrack: provider calls, no registered tool body",
    "services/api/voices.ts": "audition-voice / design-voice: provider calls, no registered body",
    "services/api/media.ts": "generate-video: no registered tool body yet",
    "services/api/context.ts":
        "read-file: a vision read of an upload, no registered tool body to resolve",
    // the agent turn holds ONE reservation for the whole turn and passes holds:"caller" down, which
    // is the seam that stops unifying from double-charging every chat message
    "services/api/ai.ts": "the /ai/turn reservation the whole turn settles against",
};

const inScope = (f: string): boolean =>
    /^services\/.*\.ts$/.test(f) && !/__tests__|\.test\.|\.itest\./.test(f);

interface Hit {
    file: string;
    line: number;
    text: string;
    why: string;
}

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;
const lineText = (text: string, line: number): string => (text.split("\n")[line - 1] ?? "").trim();

export function scan(
    files: readonly string[],
    ids: readonly string[],
    read: (f: string) => string = (f) => readFileSync(f, "utf8"),
): Hit[] {
    const hits: Hit[] = [];
    const named = new RegExp(`["'](${[...ids].join("|")})["']`);
    for (const file of files) {
        const text = read(file);
        const isApi = file.startsWith("services/api/");
        if (isApi)
            text.split("\n").forEach((line, i) => {
                if (TOOL_BODY_IMPORT.test(line))
                    hits.push({
                        file,
                        line: i + 1,
                        text: line.trim(),
                        why: "an api file imports a tool body",
                    });
            });
        if (file === EXECUTOR || Object.hasOwn(ALLOW, file)) continue;
        for (const m of text.matchAll(RESERVE_CALL)) {
            const args = text.slice(m.index, m.index + RESERVE_LOOKAHEAD);
            if (!named.test(args)) continue;
            const line = lineAt(text, m.index);
            hits.push({
                file,
                line,
                text: lineText(text, line),
                why: "reserve() names a tool outside the executor",
            });
        }
    }
    return hits;
}

// The wrapped form is deliberate: the first version of this guard matched a single line, and every
// reserve() in the routes had already been reformatted across five of them.
const PROBES: Record<string, string> = {
    "services/api/probe-body.ts":
        'import { reviseElement } from "@services/core/ai/tools/element";\n',
    "services/api/probe-reserve.ts":
        'const held = await reserve(ws, userId, "revise-element", {});\n',
    "services/core/probe-wrapped.ts":
        'const held = await reserve(\n    ws,\n    userId,\n    "revise-element",\n    {},\n);\n',
};
// and the shapes that must NOT report, or the guard is noise the next person turns off
const NEGATIVE: Record<string, string> = {
    "services/api/probe-type-only.ts":
        'import type { WrittenNotes } from "@services/core/ai/tools/notes";\n',
    "services/core/probe-declaration.ts":
        "export async function reserve(\n    ws: WorkspaceCreditFields,\n    tool: ToolId,\n) {}\n",
};
const PROBE_IDS = ["revise-element", "generate-image"];
const planted = scan(Object.keys(PROBES), PROBE_IDS, (f) => PROBES[f] ?? "");
const noisy = scan(Object.keys(NEGATIVE), PROBE_IDS, (f) => NEGATIVE[f] ?? "");
if (noisy.length) {
    w("");
    w("Tool guard self-check failed: it reported shapes that are allowed.");
    for (const h of noisy) w(`  ${h.file}:${h.line}  ${h.why}`);
    process.exit(1);
}
const missed = Object.keys(PROBES).filter((f) => !planted.some((h) => h.file === f));
if (missed.length) {
    w("");
    w(`Tool guard self-check failed: planted violations went unreported (${missed.join(", ")}).`);
    w(`The scan in ${SELF} has stopped working; fix it before trusting a green run.`);
    process.exit(1);
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && inScope(f) && existsSync(f));

const hits = scan(files, Object.keys(TOOLS));

if (hits.length) {
    w("");
    w("Tool guard failed: a caller reached around the executor.\n");
    for (const h of hits) w(`  ${h.file}:${h.line}  ${h.why}\n      ${h.text.slice(0, 100)}`);
    w("");
    w("Run the tool through services/core/ai/execute.ts instead: runTool({ id, surface, input },");
    w("principal, opts). It owns the surface check, the granted scope, the plan entitlement, the");
    w("input schema and the credit hold, so one tool costs and validates the same however it was");
    w("reached. A reserve that genuinely has no tool body behind it goes in this script's ALLOW");
    w("with a reason.");
    process.exit(1);
}

// the catalog half, which no amount of text scanning can answer

const catalogFaults: string[] = [];
for (const [id, def] of Object.entries(TOOLS)) {
    const reachable = def.surfaces.some((s) => s !== "internal");
    if (reachable && !isToolScope(scopeFor(id as ToolId)))
        catalogFaults.push(
            `${id}: reachable on ${def.surfaces.join("/")} but resolves to no scope`,
        );
    if (def.surfaces.includes("mcp") && id.length > 64)
        catalogFaults.push(`${id}: an mcp tool name may be at most 64 characters`);
}
// A planned tool (`live` unset) may name where it will live; a live one may not, because
// tools/list is built from the registry and would quietly leave it out.
const implemented = new Set(toolsFor("mcp").map((t) => t.id));
for (const [id, def] of Object.entries(TOOLS))
    if (
        def.surfaces.includes("mcp") &&
        def.live &&
        def.kind !== "proposal" &&
        !implemented.has(id as ToolId)
    )
        catalogFaults.push(`${id}: live on the mcp surface with no implementation to run`);

if (catalogFaults.length) {
    w("");
    w("Tool guard failed: the catalog exposes something it cannot serve.\n");
    for (const f of catalogFaults) w(`  ${f}`);
    w("");
    w(
        "A tool's surfaces say where it can be reached and scopeFor says what permission that takes;",
    );
    w("both are stated in model/tools.ts, so a tool joining a surface answers in the same diff.");
    process.exit(1);
}

// the pricing half: a tool with a body can spend money, so its price has to be a decision

/**
 * Tools that have a body but say nothing about what they cost. An unpriced tool takes the free
 * branch in reserve(), which returns a settle that never calls owed(), so a body reaching a
 * provider burns tokens nobody is billed for. suggest-sections shipped that way: it called
 * generateObject on every use and charged nothing.
 */
export function unpriced(
    ids: readonly string[],
    defs: Readonly<Record<string, { usage?: unknown; meter?: unknown; free?: true }>>,
): string[] {
    return ids.filter((id) => {
        const def = defs[id];
        return !!def && !def.usage && !def.meter && def.free !== true;
    });
}

const PRICE_PROBE = {
    "silent-spender": {},
    priced: { usage: { reply: 1 } },
    metered: { meter: () => ({}) },
    "declared-free": { free: true as const },
};
const probed = unpriced(Object.keys(PRICE_PROBE), PRICE_PROBE);
if (probed.length !== 1 || probed[0] !== "silent-spender") {
    w("");
    w("Tool guard self-check failed: the pricing rule did not report exactly the unpriced tool.");
    w(`It reported [${probed.join(", ")}]; expected [silent-spender]. Fix the rule in ${SELF}.`);
    process.exit(1);
}

const silent = unpriced(registeredToolIds(), TOOLS);
if (silent.length) {
    w("");
    w("Tool guard failed: a tool with a body says nothing about what it costs.\n");
    for (const id of silent) w(`  ${id}`);
    w("");
    w("An unpriced tool takes the free branch in reserve(), which never settles, so if its body");
    w("reaches a provider the tokens are burned and nobody is billed. Give it a `usage` if it");
    w("spends, or `free: true` if giving it away is the intent. Either way it becomes a decision");
    w("somebody made in a reviewed diff rather than a field that was left off.");
    process.exit(1);
}

w(
    `✓ one executor, one catalog (${files.length} files scanned, ${implemented.size} mcp tools, ` +
        `${registeredToolIds().length} bodies priced or declared free)`,
);
