import type { TurnEvent } from "@model/ai";
import type { Usage } from "@model/credits";
import { featuresFor } from "@model/billing";
import type { MeterParams, ToolId, ToolScope, ToolSurface } from "@model/tools";
import { scopeFor, TOOLS } from "@model/tools";
import type { WorkspaceRole } from "@model/workspace";
import type { WorkspaceCreditFields } from "@services/core/ledger";
import { ratesFor, reserve } from "@services/core/spend";
import type { ModelOverrides } from "@services/core/models";
import type { Meter } from "./meter";
import { getTool, makeContext } from "./tools";
import type { ToolContext } from "./tools";

// The one envelope around a tool call: the surface check, the input schema, and the credit hold.
// Every caller goes through here — the chat agent, the direct routes, and the MCP server — so a
// tool costs the same and validates the same however it was reached. The bodies live in ./tools/*,
// the registry in ./tools.ts; this file owns only what happens around them.

export interface ToolRun {
    id: ToolId;
    surface: ToolSurface;
    input: unknown; // untrusted: the tool's own schema is what parses it
}

export interface ToolPrincipal {
    userId: string;
    ws: WorkspaceCreditFields;
    role: WorkspaceRole;
    // What this caller was granted, when the call arrived through a delegated credential. Absent
    // means the caller is acting as themselves in the product, where a session already carries the
    // full set; present means an OAuth token said which subset an MCP client may use.
    scopes?: readonly ToolScope[];
}

export interface RunToolOptions {
    ctx: Omit<ToolContext, "use" | "tier">;
    size?: MeterParams; // scales the estimate for metered tools
    models?: ModelOverrides;
    // Who holds the credits. "caller" means an enclosing turn already reserved for this work, which
    // is what keeps a chat turn on one reservation rather than one per tool call.
    holds?: "self" | "caller";
    onEvent?: (event: TurnEvent) => void;
    // Flat-priced assets the run made; tokens are metered for us, so only these need reporting.
    produced?: () => Usage;
    // An eval admin asked for this run to be recorded, which changes what the reservation collects.
    trace?: boolean;
    // The spans the run collected, for a caller that asked to trace. The executor owns the
    // reservation, so handing the meter back out is the only way a caller can read them.
    onMeter?: (meter: Meter) => void;
}

export type ToolOutcome<R> =
    | { ok: true; result: R }
    | { ok: false; reason: "unknown-tool" | "wrong-surface" }
    // the granted set did not cover this tool; `needs` is what would have
    | { ok: false; reason: "scope"; needs: ToolScope }
    // the workspace's plan does not carry the entitlement this tool is gated on
    | { ok: false; reason: "entitlement"; feature: string }
    | { ok: false; reason: "bad-input"; issues: string[] }
    | { ok: false; reason: "credits"; remaining: number; capped?: number };

/**
 * `principal` is null for a public tool, which has no account to bill or gate: it runs at the free
 * plan's model tier and never opens the ledger. The catalog decides which those are, and
 * `check:tools` refuses to let a priced tool claim to be one.
 */
export async function runTool<R = unknown>(
    call: ToolRun,
    principal: ToolPrincipal | null,
    opts: RunToolOptions,
): Promise<ToolOutcome<R>> {
    const def = TOOLS[call.id];
    const tool = getTool(call.id);
    if (!def || !tool) return { ok: false, reason: "unknown-tool" };
    if (!def.surfaces.includes(call.surface)) return { ok: false, reason: "wrong-surface" };

    // Before anything is parsed or held: a caller that may not run this tool must not learn whether
    // its arguments were well formed, and must never reach a body that spends credits. A public
    // tool has neither a granted scope nor a plan, so both gates belong to the accounted path.
    const needs = scopeFor(call.id);
    if (principal?.scopes && !principal.scopes.includes(needs))
        return { ok: false, reason: "scope", needs };

    if (principal && def.requires && !featuresFor(principal.ws)[def.requires])
        return { ok: false, reason: "entitlement", feature: def.requires };

    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success)
        return {
            ok: false,
            reason: "bad-input",
            issues: parsed.error.issues.map((i) =>
                i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
            ),
        };

    // a public tool has no plan behind it, so it runs at the free tier's model choice
    const tier = featuresFor(principal?.ws ?? { plan: null }).textModelTier;
    const ctx = makeContext({ ...opts.ctx, tier });
    // the registry erases each tool's input type so one map can hold every shape; the value here
    // came out of that same tool's schema a few lines up
    const body = async (): Promise<R> => {
        const gen = (tool.run as (i: unknown, c: ToolContext) => AsyncGenerator<TurnEvent, R>)(
            parsed.data,
            ctx,
        );
        let step = await gen.next();
        while (!step.done) {
            opts.onEvent?.(step.value);
            step = await gen.next();
        }
        return step.value;
    };

    if (opts.holds === "caller" || !principal) return { ok: true, result: await body() };

    const held = await reserve(principal.ws, principal.userId, call.id, {
        size: opts.size,
        rates: ratesFor(principal.ws, opts.models ?? {}),
        trace: opts.trace,
        role: principal.role,
        // the surface the call came in on, so a run from an MCP client is not reported as a chat one
        surface: call.surface,
    });
    if (!held.ok)
        return { ok: false, reason: "credits", remaining: held.remaining, capped: held.capped };

    return held.settle(async (produced, meter) => {
        opts.onMeter?.(meter);
        try {
            return { ok: true as const, result: await body() };
        } finally {
            // in a finally so a run that made an image and then threw still bills for the image
            const made = opts.produced?.();
            if (made) produced(made);
        }
    });
}
