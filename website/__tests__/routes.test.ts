import { describe, expect, it } from "vitest";
import { LEGAL_DOC_IDS, LEGAL_PATHS, legalDocFor } from "../routes";

describe("legalDocFor", () => {
    it("resolves each legal path to its document", () => {
        expect(legalDocFor("/privacy")).toBe("privacy");
        expect(legalDocFor("/terms")).toBe("terms");
    });

    it("accepts a trailing slash, which is how these links get pasted", () => {
        expect(legalDocFor("/privacy/")).toBe("privacy");
        expect(legalDocFor("/terms/")).toBe("terms");
    });

    it("resolves every declared path, so a new document cannot be added without a route", () => {
        for (const id of LEGAL_DOC_IDS) expect(legalDocFor(LEGAL_PATHS[id])).toBe(id);
    });

    it("leaves the landing page and the app alone", () => {
        expect(legalDocFor("/")).toBeNull();
        expect(legalDocFor("/home")).toBeNull();
        expect(legalDocFor("/edit/abc")).toBeNull();
        expect(legalDocFor("/pricing")).toBeNull();
    });

    it("matches the whole path, not a prefix or a suffix", () => {
        expect(legalDocFor("/privacy/cookies")).toBeNull();
        expect(legalDocFor("/terms-of-service")).toBeNull();
        expect(legalDocFor("/legal/terms")).toBeNull();
        expect(legalDocFor("privacy")).toBeNull();
        expect(legalDocFor("")).toBeNull();
    });
});
