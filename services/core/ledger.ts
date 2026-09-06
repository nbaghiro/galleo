import { eq, sql } from "drizzle-orm";
import { db } from "@services/db/client";
import type { Tx } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { PlanBearer } from "@model/billing";
import { clipGrant, grantFor, rolloverCapFor } from "@model/billing";
import type { Usage } from "@model/credits";

// Re-exported so the ledger's own callers keep one import; the type belongs to the db handle.
export type { Tx };

// The credit ledger: how a balance moves and what history it leaves. Knows nothing about tools,
// models, or tokens — what an AI action costs, and when to charge it, is core/spend.ts.
//
// There is one counter, `ai_credits_balance`, and it is a balance rather than a usage tally. Every
// window adds the grant without clearing what is there, so unspent credits carry; a purchased pack
// adds to the same number. Grants clip against ROLLOVER_CAP_MONTHS of banked allowance (clipGrant
// in @model/billing); `purchased_credits` tracks the pack share the clip must never touch.
//
// Each mutation locks the workspace row (SELECT … FOR UPDATE) so concurrent requests serialize and
// none passes a near-limit gate twice.
//
// One action is one ledger row. The charge writes it at its estimate and the settle rewrites that
// same row with what the work really cost, so history reads as a list of things the user did rather
// than a list of accounting steps we took.

export type WorkspaceCreditFields = PlanBearer & { id: string };

/**
 * Add credits at most once, ever, keyed on `credits.key`. The column is unique, so the insert either
 * claims the key or finds it taken and does nothing, which makes this safe against a redelivered
 * Stripe webhook and against two requests racing the same grant. The balance moves only when the row
 * is claimed, so there is no path where history and the counter disagree.
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

/** The pool as it stands, for a gate that must answer without charging (ToolMeta.gate). */
export async function creditBalance(ws: { id: string }): Promise<number> {
    const [row] = await db
        .select({ balance: schema.workspaces.aiCreditsBalance })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, ws.id));
    return row?.balance ?? 0;
}

interface SpendResult {
    ok: boolean;
    remaining: number; // the balance after this charge
    entryId: string | null; // the ledger row to true up; null when the charge was refused
}

export async function chargeCredits(
    ws: { id: string },
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
    ws: { id: string },
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
        // the charge row already carries the reason, the usage, and who ran it
        await tx
            .update(schema.credits)
            .set({ delta: sql`${schema.credits.delta} - ${delta}`, balanceAfter: balance })
            .where(eq(schema.credits.id, entryId));
    });
}

export const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
        aiCreditsBalance: grantFor({ plan: plan ?? null, seats: 1 }),
        creditsStartedAt: startedAt,
        creditsResetAt: new Date(startedAt.getTime() + WINDOW_MS),
    };
}

export interface OpenedWindow {
    aiCreditsBalance: number;
    purchasedCredits: number;
    creditsStartedAt: Date;
    creditsResetAt: Date;
}

/**
 * Open a fresh 30-day window and add the grant to what is banked, clipped at the rollover cap with
 * the pack share shielded. The one place a window opens: the lazy roll, a subscription checkout,
 * and an upgrade all come through here. `key` claims `credits.key`, so a redelivered event or two
 * racing requests grant once; a grant clipped to zero still writes its row, so a short month is
 * visible in history rather than mysterious. Callers hold the row lock and pass its live counters.
 */
export async function openWindow(
    tx: Tx,
    ws: PlanBearer & {
        id: string;
        seats: number;
        aiCreditsBalance: number;
        purchasedCredits: number;
    },
    key: string,
    reason: string,
    also?: Partial<typeof schema.workspaces.$inferInsert>,
): Promise<OpenedWindow | null> {
    const startedAt = new Date();
    const grant = clipGrant(
        grantFor(ws),
        ws.aiCreditsBalance,
        ws.purchasedCredits,
        rolloverCapFor(ws),
    );
    const window = {
        // clamp against the pre-grant balance: a spent pack decays to zero rather than counting
        // the fresh grant as pack credits and inflating every later ceiling
        purchasedCredits: Math.min(ws.purchasedCredits, ws.aiCreditsBalance),
        creditsStartedAt: startedAt,
        creditsResetAt: new Date(startedAt.getTime() + WINDOW_MS),
    };
    const claimed = await grantOnce(tx, ws, {
        key,
        delta: grant,
        reason,
        also: { ...also, ...window },
    });
    return claimed ? { aiCreditsBalance: ws.aiCreditsBalance + grant, ...window } : null;
}

/**
 * The monthly grant for every plan: there is no cron, so reading the workspace is what rolls the
 * window. Locked and re-checked under the lock, so the parallel requests of an app boot roll it
 * exactly once; returns the fresh values, or null when nothing lapsed.
 */
export async function rollIfLapsed(
    ws: PlanBearer & { id: string; seats: number; creditsResetAt: Date },
): Promise<OpenedWindow | null> {
    if (ws.creditsResetAt.getTime() > Date.now()) return null;
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                balance: schema.workspaces.aiCreditsBalance,
                resetAt: schema.workspaces.creditsResetAt,
                purchased: schema.workspaces.purchasedCredits,
            })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row || row.resetAt.getTime() > Date.now()) return null;
        return openWindow(
            tx,
            { ...ws, aiCreditsBalance: row.balance, purchasedCredits: row.purchased },
            `roll:${ws.id}:${row.resetAt.toISOString()}`,
            "monthly-grant",
        );
    });
}
