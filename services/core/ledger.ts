import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@services/db/client";
import type { Tx } from "@services/db/client";
import { schema } from "@services/db/schema";
import { monthlyGrantFor } from "@model/billing";
import type { Usage } from "@model/credits";

// Re-exported so the ledger's own callers keep one import; the type belongs to the db handle.
export type { Tx };

// The credit ledger: how a balance moves and what history it leaves. Knows nothing about tools,
// models, or tokens — what an AI action costs, and when to charge it, is core/spend.ts.
//
// There is one counter, `ai_credits_balance`, and it is a balance rather than a usage tally. The
// subscription adds its monthly grant at each roll without clearing what is there, so unspent
// credits carry; a purchased pack adds to the same number. Because nothing is ever wiped, a bought
// credit needs no pool of its own, which is what lets one column hold both.
//
// Each mutation locks the workspace row (SELECT … FOR UPDATE) so concurrent requests serialize and
// none passes a near-limit gate twice.
//
// One action is one ledger row. The charge writes it at its estimate and the settle rewrites that
// same row with what the work really cost, so history reads as a list of things the user did rather
// than a list of accounting steps we took.

/**
 * Add credits at most once, ever, keyed on `credits.key`. The column is unique, so the insert either
 * claims the key or finds it taken and does nothing, which makes this safe against a redelivered
 * Stripe webhook and against two requests racing the same grant. The balance moves only when the row
 * is claimed, so there is no path where history and the counter disagree.
 *
 * Lives here rather than beside its Stripe callers because the balance is this file's concern, and a
 * second caller (the signup grant) would otherwise have copied it.
 */
export async function grantOnce(
    tx: Tx,
    ws: { id: string; aiCreditsBalance: number },
    g: {
        key: string;
        delta: number;
        reason: string;
        also?: Partial<typeof schema.workspaces.$inferInsert>;
    },
): Promise<boolean> {
    const balanceAfter = ws.aiCreditsBalance + g.delta;
    const [claimed] = await tx
        .insert(schema.credits)
        .values({ workspaceId: ws.id, delta: g.delta, reason: g.reason, key: g.key, balanceAfter })
        .onConflictDoNothing({ target: schema.credits.key })
        .returning({ id: schema.credits.id });
    if (!claimed) return false;
    await tx
        .update(schema.workspaces)
        .set({ ...g.also, aiCreditsBalance: balanceAfter })
        .where(eq(schema.workspaces.id, ws.id));
    return true;
}

export type WorkspaceCreditFields = {
    id: string;
    plan: string | null;
    seats: number;
    featureOverrides?: typeof schema.workspaces.$inferSelect.featureOverrides;
    creditsStartedAt?: Date;
    memberCreditCap?: number | null;
};

// One person's net spend since the window opened: charges minus refunds. Only spends and settles
// carry a user, so grants and resets (system rows) net out of this by construction.
export async function spendThisCycle(
    ws: { id: string; creditsStartedAt: Date },
    userId: string,
): Promise<number> {
    const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(-${schema.credits.delta}), 0)` })
        .from(schema.credits)
        .where(
            and(
                eq(schema.credits.workspaceId, ws.id),
                eq(schema.credits.userId, userId),
                gt(schema.credits.createdAt, ws.creditsStartedAt),
            ),
        );
    return Math.max(0, Number(row?.total ?? 0));
}

interface SpendResult {
    ok: boolean;
    remaining: number; // the balance after this charge
    entryId: string | null; // the ledger row to true up; null when the charge was refused
}

export async function chargeCredits(
    ws: WorkspaceCreditFields,
    cost: number,
    reason: string,
    userId?: string, // who initiated it; absent = system
    usage?: Usage, // what the charge is for, for the ledger's breakdown
): Promise<SpendResult> {
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select({ balance: schema.workspaces.aiCreditsBalance })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row) return { ok: false, remaining: 0, entryId: null };
        if (cost > row.balance) return { ok: false, remaining: row.balance, entryId: null };
        const remaining = row.balance - cost;
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsBalance: remaining })
            .where(eq(schema.workspaces.id, ws.id));
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
        return { ok: true, remaining, entryId: entry!.id };
    });
}

// delta > 0 bills beyond the reserve, delta < 0 refunds an over-reserve; applied against the LIVE
// row, so a spend that landed mid-turn survives and extra spend can drive the balance to zero.
// `entryId` is the row chargeCredits wrote, which this rewrites in place rather than appending to.
export async function settleCredits(
    ws: WorkspaceCreditFields,
    entryId: string,
    delta: number,
): Promise<void> {
    if (delta === 0) return;
    await db.transaction(async (tx) => {
        const [row] = await tx
            .select({ balance: schema.workspaces.aiCreditsBalance })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row) return;
        const balance = Math.max(0, row.balance - delta);
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsBalance: balance })
            .where(eq(schema.workspaces.id, ws.id));
        // the charge row already carries the reason and who ran it; only the amount moved
        await tx
            .update(schema.credits)
            .set({ delta: sql`${schema.credits.delta} - ${delta}`, balanceAfter: balance })
            .where(eq(schema.credits.id, entryId));
    });
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What a brand-new workspace opens with. The window matters because the column defaults leave a row
 * born already lapsed; the balance matters because it is a balance now, so a row born at zero could
 * not generate at all until its first roll.
 */
export function freshCreditWindow(plan?: string | null): {
    aiCreditsBalance: number;
    creditsStartedAt: Date;
    creditsResetAt: Date;
} {
    const startedAt = new Date();
    return {
        aiCreditsBalance: monthlyGrantFor({ plan: plan ?? null, seats: 1 }),
        creditsStartedAt: startedAt,
        creditsResetAt: new Date(startedAt.getTime() + WINDOW_MS),
    };
}

interface RolledWindow {
    aiCreditsBalance: number;
    creditsStartedAt: Date;
    creditsResetAt: Date;
}

/**
 * Open a fresh monthly window if the current one has lapsed, adding the grant to what is already
 * there. Unspent credits carry: the balance is never cleared, so a quiet month funds a busy one and
 * a purchased pack is not at risk from the calendar. Locked and re-checked under the lock, so the
 * parallel requests of an app boot roll it exactly once; returns the fresh values, or null when
 * another request already rolled it (or it hasn't lapsed).
 */
export async function rollCreditWindow(
    ws: WorkspaceCreditFields & { creditsResetAt: Date },
): Promise<RolledWindow | null> {
    if (ws.creditsResetAt.getTime() > Date.now()) return null;
    const grant = monthlyGrantFor(ws);
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                balance: schema.workspaces.aiCreditsBalance,
                resetAt: schema.workspaces.creditsResetAt,
            })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row || row.resetAt.getTime() > Date.now()) return null;
        const startedAt = new Date();
        const resetAt = new Date(startedAt.getTime() + WINDOW_MS);
        const balance = row.balance + grant;
        await tx
            .update(schema.workspaces)
            .set({
                aiCreditsBalance: balance,
                creditsStartedAt: startedAt,
                creditsResetAt: resetAt,
            })
            .where(eq(schema.workspaces.id, ws.id));
        // a positive row, since the grant is money in rather than a counter being wiped
        await tx.insert(schema.credits).values({
            workspaceId: ws.id,
            delta: grant,
            reason: "monthly-grant",
            balanceAfter: balance,
        });
        return { aiCreditsBalance: balance, creditsStartedAt: startedAt, creditsResetAt: resetAt };
    });
}
