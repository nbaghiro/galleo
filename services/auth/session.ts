import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal signed-cookie session for the demo: the cookie value is `<userId>.<hmac>`. Good enough to
// authenticate the seeded demo user locally; real OAuth (Google/Microsoft) layers on later.

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
export const SESSION_COOKIE = "galleo_session";

function sign(value: string): string {
    const mac = createHmac("sha256", SECRET).update(value).digest("base64url");
    return `${value}.${mac}`;
}

export function makeSession(userId: string): string {
    return sign(userId);
}

// Returns the userId if the token is valid + untampered, else null.
export function readSession(token: string | undefined): string | null {
    if (!token) return null;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const value = token.slice(0, dot);
    const expected = sign(value);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return value;
}
