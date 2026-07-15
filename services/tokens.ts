import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "./schema";

// Email-verification + password-reset tokens. The raw token goes only into the emailed link; we persist
// its SHA-256 so a DB leak can't be replayed. Tokens are single-use (consumedAt) and time-bounded.

export type TokenPurpose = "verify" | "reset";

function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

// Mint a token for `purpose`, store its hash with an expiry, and return the RAW token for the link.
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

// Validate + consume a token in one atomic UPDATE: only an unconsumed, unexpired row of the right
// purpose flips to consumed and yields its userId. Returns null otherwise (so it can't be replayed,
// even under a concurrent double-submit).
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
