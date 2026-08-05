import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "./schema";

// the raw token goes only into the emailed link; storing its SHA-256 makes a DB leak unreplayable

export type TokenPurpose = "verify" | "reset";

function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

// returns the RAW token for the link; only its hash is stored
export async function createAuthToken(
    userId: string,
    purpose: TokenPurpose,
    ttlSeconds: number,
): Promise<string> {
    const raw = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db
        .insert(schema.authTokens)
        .values({ userId, purpose, tokenHash: hashToken(raw), expiresAt });
    return raw;
}

// validate + consume in one atomic UPDATE, so a token can't be replayed under a double-submit
export async function consumeAuthToken(
    raw: string | undefined,
    purpose: TokenPurpose,
): Promise<string | null> {
    if (!raw) return null;
    const [consumed] = await db
        .update(schema.authTokens)
        .set({ consumedAt: new Date() })
        .where(
            and(
                eq(schema.authTokens.tokenHash, hashToken(raw)),
                eq(schema.authTokens.purpose, purpose),
                isNull(schema.authTokens.consumedAt),
                gt(schema.authTokens.expiresAt, new Date()),
            ),
        )
        .returning({ userId: schema.authTokens.userId });
    return consumed?.userId ?? null;
}
