import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { creditLimitFor } from "@model/billing";
import type { Usage } from "@model/credits";

// Each mutation locks the workspace row (SELECT … FOR UPDATE) so concurrent requests serialize and
// none passes a near-limit gate twice. Spend order is the monthly pool, then bonus credits (never
// reset); a refund unwinds in reverse, restoring bonus before pool, since bonus is paid money.
//
// One action is one ledger row. The charge writes it at its estimate and the settle rewrites that
// same row with what the work really cost, so history reads as a list of things the user did rather
// than a list of accounting steps we took.

export type WorkspaceCreditFields = {
    id: string;
    plan: string | null;
    seats: number;
    featureOverrides?: typeof schema.workspaces.$inferSelect.featureOverrides;
};

export interface SpendResult {
    ok: boolean;
    remaining: number; // pool room + bonus
    limit: number;
    fromBonus: number; // how much of this charge bonus covered — the settle needs it to refund fairly
    entryId: string | null; // the ledger row to true up; null when the charge was refused
}

const balanceCols = {
    used: schema.workspaces.aiCreditsUsed,
    bonus: schema.workspaces.aiCreditsBonus,
};

export async function chargeCredits(
    ws: WorkspaceCreditFields,
    cost: number,
    reason: string,
    userId?: string, // who initiated it; absent = system
    usage?: Usage, // what the charge is for, for the ledger's breakdown
): Promise<SpendResult> {
    const limit = creditLimitFor(ws);
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select(balanceCols)
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row) return { ok: false, remaining: 0, limit, fromBonus: 0, entryId: null };
        const available = Math.max(0, limit - row.used) + row.bonus;
        if (cost > available)
            return { ok: false, remaining: available, limit, fromBonus: 0, entryId: null };
        const fromPool = Math.min(cost, Math.max(0, limit - row.used));
        const fromBonus = cost - fromPool;
        const used = row.used + fromPool;
        const bonus = row.bonus - fromBonus;
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsUsed: used, aiCreditsBonus: bonus })
            .where(eq(schema.workspaces.id, ws.id));
        const remaining = Math.max(0, limit - used) + bonus;
        const [entry] = await tx
            .insert(schema.credits)
            .values({
                workspaceId: ws.id,
                userId: userId ?? null,
                delta: -cost,
                reason,
                usage,
                balanceAfter: remaining,
            })
            .returning({ id: schema.credits.id });
        return { ok: true, remaining, limit, fromBonus, entryId: entry!.id };
    });
}

// delta > 0 bills usage beyond the reserve, delta < 0 refunds an over-reserve; applied against the
// LIVE row, so a spend that landed mid-turn survives and extra spend can push the pool past its cap.
// `bonusFirst` is the charge's fromBonus: a refund restores that much to bonus before touching pool.
// `entryId` is the row chargeCredits wrote, which this rewrites in place rather than appending to.
export async function settleCredits(
    ws: WorkspaceCreditFields,
    entryId: string,
    delta: number,
    bonusFirst = 0,
): Promise<void> {
    if (delta === 0) return;
    const limit = creditLimitFor(ws);
    await db.transaction(async (tx) => {
        const [row] = await tx
            .select(balanceCols)
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row) return;
        let { used, bonus } = row;
        if (delta > 0) {
            const fromPool = Math.min(delta, Math.max(0, limit - used));
            const rest = delta - fromPool;
            const fromBonus = Math.min(rest, bonus);
            used += fromPool + (rest - fromBonus);
            bonus -= fromBonus;
        } else {
            const back = -delta;
            const toBonus = Math.min(back, Math.max(0, bonusFirst));
            bonus += toBonus;
            used = Math.max(0, used - (back - toBonus));
        }
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsUsed: used, aiCreditsBonus: bonus })
            .where(eq(schema.workspaces.id, ws.id));
        // the charge row already carries the reason and who ran it; only the amount moved
        await tx
            .update(schema.credits)
            .set({
                delta: sql`${schema.credits.delta} - ${delta}`,
                balanceAfter: Math.max(0, limit - used) + bonus,
            })
            .where(eq(schema.credits.id, entryId));
    });
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The credit window a brand-new workspace opens with; without it the row is born already lapsed. */
export function freshCreditWindow(): { creditsStartedAt: Date; creditsResetAt: Date } {
    const startedAt = new Date();
    return {
        creditsStartedAt: startedAt,
        creditsResetAt: new Date(startedAt.getTime() + WINDOW_MS),
    };
}

export interface RolledWindow {
    aiCreditsUsed: number;
    creditsStartedAt: Date;
    creditsResetAt: Date;
}

/**
 * Open a fresh monthly window if the current one has lapsed. Locked and re-checked under the lock, so
 * the parallel requests of an app boot roll it exactly once; returns the fresh values, or null when
 * another request already rolled it (or it hasn't lapsed).
 */
export async function rollCreditWindow(
    ws: WorkspaceCreditFields & { creditsResetAt: Date },
): Promise<RolledWindow | null> {
    if (ws.creditsResetAt.getTime() > Date.now()) return null;
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                used: schema.workspaces.aiCreditsUsed,
                bonus: schema.workspaces.aiCreditsBonus,
                resetAt: schema.workspaces.creditsResetAt,
            })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row || row.resetAt.getTime() > Date.now()) return null;
        const startedAt = new Date();
        const resetAt = new Date(startedAt.getTime() + WINDOW_MS);
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 0, creditsStartedAt: startedAt, creditsResetAt: resetAt })
            .where(eq(schema.workspaces.id, ws.id));
        if (row.used > 0)
            await tx.insert(schema.credits).values({
                workspaceId: ws.id,
                delta: row.used,
                reason: "monthly-reset",
                balanceAfter: creditLimitFor(ws) + row.bonus,
            });
        return { aiCreditsUsed: 0, creditsStartedAt: startedAt, creditsResetAt: resetAt };
    });
}
