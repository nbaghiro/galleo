import { createSignal } from "solid-js";
import type { PaywallReason } from "@app/api";
import { ApiError } from "@app/api";
import { areaFor } from "@model/analytics";
import { capture } from "@ui/analytics";

// One place every failed AI action reports to. The server passes the provider's own message through,
// which is sometimes plain ("no credits remaining") and sometimes jargon ("Grammar compilation timed
// out"), so the title says what we were doing and the body translates what came back.

export interface AppError {
    title: string;
    detail?: string; // the server's own words, kept verbatim
    hint?: string; // what the user can do about it
    upgrade?: boolean; // a higher plan exists, so offer the pricing route
    topUp?: boolean; // the plan may buy credit packs, the only remedy left on the top plan
}

const [appError, setAppError] = createSignal<AppError | null>(null);
export { appError };

export const dismissError = (): void => {
    setAppError(null);
};

const isAbort = (e: unknown): boolean =>
    e instanceof DOMException ? e.name === "AbortError" : false;

// Provider wording the user cannot act on, in plain terms. Order matters: first match wins.
const HINTS: [RegExp, string][] = [
    [
        /no credits remaining|insufficient[_ ]quota|billing|payment/i,
        "The AI provider account behind this server is out of credits.",
    ],
    [
        /rate.?limit|overloaded|429|quota exceeded/i,
        "The model is busy right now. Try again shortly.",
    ],
    [
        /api key|unauthori[sz]ed|authentication|invalid[_ ]api/i,
        "This server's key for that provider isn't working.",
    ],
    [
        /grammar compilation|did not match schema|no object generated/i,
        "The model returned something we couldn't read. Another model usually gets it right.",
    ],
    [/timed out|timeout|ETIMEDOUT|deadline/i, "The model took too long to answer."],
    [/not configured/i, "No AI provider is configured on this server."],
];

const STATUS: Record<number, { title: string; hint: string }> = {
    401: { title: "You're signed out", hint: "Sign in again to pick up where you left off." },
    403: { title: "Not allowed", hint: "Your plan or role doesn't cover that." },
    429: { title: "Too many requests", hint: "Give it a moment and try again." },
    501: { title: "Not available yet", hint: "That step isn't built yet." },
    503: { title: "AI is unavailable", hint: "No AI provider is configured on this server." },
};

// One status, several walls: the server names which one in `reason`, and the title and remedy
// follow from it. A member over their own cap is not out of credits, so no sale is offered there.
const PAYWALL: Record<PaywallReason, { title: string; hint?: string }> = {
    credits: { title: "Out of credits" }, // the hint depends on which remedies apply
    "member-cap": {
        title: "Your spending limit is reached",
        hint: "This workspace caps what each member can spend per cycle. A workspace admin can raise it.",
    },
    storage: { title: "Storage is full", hint: "Upgrade for more space, or remove some uploads." },
    seats: { title: "Out of seats", hint: "Add seats or remove a member first." },
    feature: { title: "Not on your plan", hint: "Upgrade to unlock it." },
};

// Names only the remedies the workspace actually has: on the top plan there is nothing to upgrade
// to, and a Free workspace cannot buy packs.
const creditHint = (upgrade?: boolean, topUp?: boolean): string =>
    upgrade && topUp
        ? "Buy a credit pack or upgrade to keep generating."
        : topUp
          ? "Buy a credit pack to keep generating."
          : upgrade
            ? "Upgrade to keep generating."
            : "Your plan adds more credits at the start of your next billing cycle.";

const message = (e: unknown): string =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "";

/** Normalises anything thrown into something worth showing. `doing` is the human sentence. */
export function describeError(e: unknown, doing: string): AppError | null {
    if (isAbort(e)) return null; // the user cancelled; not a failure
    const raw = message(e).trim();
    if (e instanceof ApiError) {
        if (e.status === 402) {
            const { upgrade, topUp, reason } = e.remedies;
            const wall = PAYWALL[reason ?? "credits"];
            return {
                title: wall.title,
                detail: raw && raw !== wall.title ? raw : undefined,
                hint: wall.hint ?? creditHint(upgrade, topUp),
                upgrade,
                topUp,
            };
        }
        const known = STATUS[e.status];
        if (known) {
            return {
                title: known.title,
                detail: raw && raw !== known.title ? raw : undefined,
                hint: known.hint,
            };
        }
    }
    const hint = HINTS.find(([re]) => re.test(raw))?.[1];
    return { title: doing, detail: raw || undefined, hint };
}

export function reportError(e: unknown, doing: string): void {
    const described = describeError(e, doing);
    if (!described) return;
    setAppError(described);
    // `doing` is our own wording for the action, not the provider's message, so no content travels.
    capture("error_shown", {
        code: doing,
        http_status: e instanceof ApiError ? e.status : 0,
        surface: areaFor(typeof window === "undefined" ? "/" : window.location.pathname),
    });
}
