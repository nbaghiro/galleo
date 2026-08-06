import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { creditLimitFor } from "@model/billing";

// each charge locks the workspace row (SELECT … FOR UPDATE) so concurrent requests serialize and none
// passes a near-limit gate twice; spend order is the monthly pool, then bonus credits (never reset)

type WorkspaceCreditFields = {
    id: string;
    plan: string | null;
    seats: number;
    featureOverrides?: typeof schema.workspaces.$inferSelect.featureOverrides;
};

export interface SpendResult {
    ok: boolean;
    remaining: number; // pool room + bonus
    limit: number;
}

const balanceCols = {
    used: schema.workspaces.aiCreditsUsed,
    bonus: schema.workspaces.aiCreditsBonus,
};

export async function chargeCredits(
    ws: WorkspaceCreditFields,
    cost: number,
    reason: string,
): Promise<SpendResult> {
    const limit = creditLimitFor(ws);
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select(balanceCols)
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, ws.id))
            .for("update");
        if (!row) return { ok: false, remaining: 0, limit };
        const available = Math.max(0, limit - row.used) + row.bonus;
        if (cost > available) return { ok: false, remaining: available, limit };
        const fromPool = Math.min(cost, Math.max(0, limit - row.used));
        const used = row.used + fromPool;
        const bonus = row.bonus - (cost - fromPool);
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsUsed: used, aiCreditsBonus: bonus })
            .where(eq(schema.workspaces.id, ws.id));
        const remaining = Math.max(0, limit - used) + bonus;
        await tx.insert(schema.credits).values({
            workspaceId: ws.id,
            delta: -cost,
            reason,
            balanceAfter: remaining,
        });
        return { ok: true, remaining, limit };
    });
}

// delta > 0 bills usage beyond the reserve, delta < 0 refunds an over-reserve; applied against the
// LIVE row, so a spend that landed mid-turn survives and extra spend can push the pool past its cap
export async function settleCredits(
    ws: WorkspaceCreditFields,
    delta: number,
    reason: string,
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
            used = Math.max(0, used + delta);
        }
        await tx
            .update(schema.workspaces)
            .set({ aiCreditsUsed: used, aiCreditsBonus: bonus })
            .where(eq(schema.workspaces.id, ws.id));
        await tx.insert(schema.credits).values({
            workspaceId: ws.id,
            delta: -delta,
            reason,
            balanceAfter: Math.max(0, limit - used) + bonus,
        });
    });
}
