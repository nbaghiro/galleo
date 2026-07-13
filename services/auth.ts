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

function sign(value: string): string {
    const mac = createHmac("sha256", SECRET).update(value).digest("base64url");
    return `${value}.${mac}`;
}

export function makeSession(userId: string): string {
    return sign(userId);
}

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
