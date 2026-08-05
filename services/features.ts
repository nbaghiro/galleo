import type { Context } from "hono";
import type { PlanId } from "@model/billing";
import { isPerSeat } from "@model/billing";
import type { BoolFeature, FeatureOverrides, Features, NumFeature } from "@model/features";
import { can, limit, resolveFeatures, withinLimit } from "@model/features";

export function featuresFor(ws: {
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}): Features {
    return resolveFeatures((ws.plan ?? "free") as PlanId, ws.featureOverrides ?? undefined);
}

type WsFeatureFields = Parameters<typeof featuresFor>[0];

// Route guards over the resolver: null = allowed, else the 402 response to return as-is.
export function requireFeature(
    c: Context,
    ws: WsFeatureFields,
    key: BoolFeature,
    message: string,
): Response | null {
    return can(featuresFor(ws), key) ? null : c.json({ error: message, upgrade: true }, 402);
}

export function checkLimit(
    c: Context,
    ws: WsFeatureFields,
    key: NumFeature,
    current: number,
    message?: (cap: number) => string,
): Response | null {
    const f = featuresFor(ws);
    if (withinLimit(f, key, current)) return null;
    const cap = limit(f, key);
    return c.json(
        {
            error: message?.(cap) ?? `Your plan is limited to ${cap} — upgrade for more.`,
            upgrade: true,
        },
        402,
    );
}

// creditsPerMonth is per seat on per-seat plans, so the pool scales with purchased seats
export function creditLimitFor(ws: {
    plan: string | null;
    seats: number;
    featureOverrides?: FeatureOverrides | null;
}): number {
    const perSeat = featuresFor(ws).creditsPerMonth;
    return isPerSeat(ws.plan) ? perSeat * Math.max(1, ws.seats) : perSeat;
}
