import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
    if (!stored) return false;
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const test = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return test.length === expected.length && timingSafeEqual(test, expected);
}

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
export const SESSION_COOKIE = "galleo_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — cookie Max-Age is aligned to this

interface SessionPayload {
    uid: string;
    iat: number; // issued-at (unix seconds)
    exp: number; // expires-at (unix seconds)
}

function hmac(value: string): string {
    return createHmac("sha256", SECRET).update(value).digest("base64url");
}

// `<value>.<hmac>` — base64url never contains ".", so the last dot always splits value from signature.
function sign(value: string): string {
    return `${value}.${hmac(value)}`;
}

export function makeSession(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = { uid: userId, iat: now, exp: now + SESSION_TTL_SECONDS };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return sign(encoded);
}

// Verify the signature + expiry and return the payload (uid + issued-at). `iat` lets the auth layer reject
// sessions minted before a password reset (see currentUser). Returns null on any tamper/expiry.
export function readSessionPayload(token: string | undefined): { uid: string; iat: number } | null {
    if (!token) return null;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const encoded = token.slice(0, dot);
    const expected = sign(encoded);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // signature verified — now decode the payload and enforce its expiry
    let payload: SessionPayload;
    try {
        payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    } catch {
        return null;
    }
    if (typeof payload.uid !== "string" || typeof payload.iat !== "number") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    return { uid: payload.uid, iat: payload.iat };
}

export function readSession(token: string | undefined): string | null {
    return readSessionPayload(token)?.uid ?? null;
}
