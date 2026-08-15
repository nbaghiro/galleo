import { describe, expect, it } from "vitest";
import { ApiError } from "@app/api";
import { describeError } from "@app/stores/errors";

describe("describeError", () => {
    it("stays quiet when the user cancelled", () => {
        expect(describeError(new DOMException("aborted", "AbortError"), "Planning")).toBeNull();
    });

    it("names the plan limit and offers the upgrade route", () => {
        const d = describeError(new ApiError(402, "out of AI credits"), "Planning");
        expect(d?.title).toBe("Out of credits");
        expect(d?.upgrade).toBe(true);
        expect(d?.detail).toBe("out of AI credits");
    });

    it("does not repeat the server's words when they match the title", () => {
        expect(
            describeError(new ApiError(429, "Too many requests"), "Planning")?.detail,
        ).toBeUndefined();
    });

    it("keeps the caller's sentence as the title for an unmapped status", () => {
        const d = describeError(new ApiError(500, "boom"), "Couldn’t plan the outline");
        expect(d?.title).toBe("Couldn’t plan the outline");
        expect(d?.detail).toBe("boom");
    });

    it("translates provider jargon into something actionable", () => {
        expect(
            describeError(new Error("Grammar compilation timed out."), "Planning")?.hint,
        ).toMatch(/couldn't read/i);
        expect(describeError(new Error("You have no credits remaining"), "Planning")?.hint).toMatch(
            /out of credits/i,
        );
        expect(describeError(new Error("Rate limit exceeded"), "Planning")?.hint).toMatch(/busy/i);
    });

    it("keeps the raw message even when nothing matched", () => {
        const d = describeError(new Error("something odd"), "Planning");
        expect(d?.detail).toBe("something odd");
        expect(d?.hint).toBeUndefined();
    });

    it("survives a thrown non-error", () => {
        expect(describeError("just a string", "Planning")?.detail).toBe("just a string");
        expect(describeError(undefined, "Planning")?.title).toBe("Planning");
    });
});
