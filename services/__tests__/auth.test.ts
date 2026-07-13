import { describe, expect, it, vi } from "vitest";
import { hashPassword, makeSession, readSession, verifyPassword } from "../auth";

// SESSION_SECRET is read once at module load — hence the re-import in the different-secret case
describe("hashPassword + verifyPassword", () => {
    it("round-trips a password through hash then verify", () => {
        const pw = "correct horse battery staple";
        expect(verifyPassword(pw, hashPassword(pw))).toBe(true);
    });

    it("rejects a wrong password", () => {
        expect(verifyPassword("wrong", hashPassword("right"))).toBe(false);
    });

    it("rejects a null stored hash", () => {
        expect(verifyPassword("anything", null)).toBe(false);
    });

    it("rejects a malformed stored hash with no separator", () => {
        expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    });

    it("produces a distinct hash each time (random salt) yet both verify", () => {
        const pw = "same-password";
        const a = hashPassword(pw);
        const b = hashPassword(pw);
        expect(a).not.toBe(b);
        expect(verifyPassword(pw, a)).toBe(true);
        expect(verifyPassword(pw, b)).toBe(true);
    });
});

describe("makeSession + readSession", () => {
    it("round-trips a userId through sign then read", () => {
        expect(readSession(makeSession("user-42"))).toBe("user-42");
    });

    it("rejects a token whose value was tampered", () => {
        const token = makeSession("user-42");
        const dot = token.lastIndexOf(".");
        const value = token.slice(0, dot);
        const mac = token.slice(dot + 1);
        const tampered = `X${value.slice(1)}.${mac}`;
        expect(tampered).not.toBe(token);
        expect(readSession(tampered)).toBeNull();
    });

    it("rejects a token missing the separator", () => {
        expect(readSession("userwithoutdot")).toBeNull();
    });

    it("rejects an empty token", () => {
        expect(readSession("")).toBeNull();
        expect(readSession(undefined)).toBeNull();
    });

    it("rejects a garbage string", () => {
        expect(readSession("!!!.@@@")).toBeNull();
    });

    it("rejects a token signed under a different secret", async () => {
        vi.resetModules();
        vi.stubEnv("SESSION_SECRET", "other-secret");
        const other = await import("../auth");
        const foreignToken = other.makeSession("user-42");
        vi.unstubAllEnvs();
        expect(other.readSession(foreignToken)).toBe("user-42");
        expect(readSession(foreignToken)).toBeNull();
    });
});
