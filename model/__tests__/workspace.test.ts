import { describe, expect, it } from "vitest";
import {
    asRole,
    cleanDisplayName,
    emailError,
    MAX_EMAIL,
    MAX_NAME_LEN,
    mergeUserPrefs,
    readUserPrefs,
    verifyCodeError,
} from "@model/workspace";

describe("asRole", () => {
    it("keeps admin and reads everything else as member", () => {
        expect(asRole("admin")).toBe("admin");
        expect(asRole("member")).toBe("member");
        expect(asRole("editor")).toBe("member"); // legacy rows predate the role column
        expect(asRole(null)).toBe("member");
        expect(asRole(undefined)).toBe("member");
    });
});

describe("readUserPrefs", () => {
    it("passes a well-formed theme id through", () => {
        expect(readUserPrefs({ appTheme: "midnight" })).toEqual({ appTheme: "midnight" });
    });

    it("answers empty for anything that is not an object", () => {
        expect(readUserPrefs(null)).toEqual({});
        expect(readUserPrefs(undefined)).toEqual({});
        expect(readUserPrefs("midnight")).toEqual({});
        expect(readUserPrefs(7)).toEqual({});
    });

    it("drops keys it does not know", () => {
        expect(readUserPrefs({ appTheme: "studio", admin: true })).toEqual({ appTheme: "studio" });
    });

    it("drops a theme that is not a non-empty string", () => {
        expect(readUserPrefs({ appTheme: 42 })).toEqual({});
        expect(readUserPrefs({ appTheme: "" })).toEqual({});
        expect(readUserPrefs({ appTheme: null })).toEqual({});
        expect(readUserPrefs({ appTheme: { id: "studio" } })).toEqual({});
    });

    it("drops an oversized theme id rather than truncating it", () => {
        expect(readUserPrefs({ appTheme: "t".repeat(65) })).toEqual({});
        expect(readUserPrefs({ appTheme: "t".repeat(64) })).toEqual({ appTheme: "t".repeat(64) });
    });
});

describe("mergeUserPrefs", () => {
    it("applies a key the patch carries", () => {
        expect(mergeUserPrefs({ appTheme: "studio" }, { appTheme: "midnight" })).toEqual({
            appTheme: "midnight",
        });
    });

    it("leaves untouched keys alone when the patch omits them", () => {
        expect(mergeUserPrefs({ appTheme: "studio" }, {})).toEqual({ appTheme: "studio" });
    });

    it("clears a key on an explicit null", () => {
        expect(mergeUserPrefs({ appTheme: "studio" }, { appTheme: null })).toEqual({});
    });

    it("ignores a patch that is not an object", () => {
        expect(mergeUserPrefs({ appTheme: "studio" }, null)).toEqual({ appTheme: "studio" });
        expect(mergeUserPrefs({ appTheme: "studio" }, "midnight")).toEqual({ appTheme: "studio" });
    });

    it("keeps the current value when the patch's own value is invalid", () => {
        expect(mergeUserPrefs({ appTheme: "studio" }, { appTheme: 42 })).toEqual({
            appTheme: "studio",
        });
        expect(mergeUserPrefs({ appTheme: "studio" }, { appTheme: "" })).toEqual({
            appTheme: "studio",
        });
    });

    it("does not mutate the object it was given", () => {
        const current = { appTheme: "studio" };
        mergeUserPrefs(current, { appTheme: null });
        expect(current).toEqual({ appTheme: "studio" });
    });
});

describe("cleanDisplayName", () => {
    it("trims and keeps a real name", () => {
        expect(cleanDisplayName("  Ada Lovelace  ")).toBe("Ada Lovelace");
    });

    it("reads a blank name as cleared", () => {
        expect(cleanDisplayName("")).toBeNull();
        expect(cleanDisplayName("   ")).toBeNull();
    });

    it("reads a non-string as cleared", () => {
        expect(cleanDisplayName(null)).toBeNull();
        expect(cleanDisplayName(undefined)).toBeNull();
        expect(cleanDisplayName(42)).toBeNull();
    });

    it("caps the stored length", () => {
        expect(cleanDisplayName("n".repeat(200))).toHaveLength(MAX_NAME_LEN);
    });

    it("trims before capping, so padding never eats the cap", () => {
        expect(cleanDisplayName(`   ${"n".repeat(80)}   `)).toHaveLength(MAX_NAME_LEN);
    });
});

describe("readUserPrefs — the onboarding branch", () => {
    it("reads a whole branch through", () => {
        expect(
            readUserPrefs({
                onboarding: {
                    format: "deck",
                    startedAt: "2026-08-17T00:00:00.000Z",
                    dismissed: true,
                },
            }),
        ).toEqual({
            onboarding: { format: "deck", startedAt: "2026-08-17T00:00:00.000Z", dismissed: true },
        });
    });

    it("keeps a valid field and drops its malformed siblings", () => {
        expect(
            readUserPrefs({ onboarding: { format: "web", startedAt: 7, dismissed: "yes" } }),
        ).toEqual({ onboarding: { format: "web" } });
    });

    it("drops a format that is not a surface", () => {
        expect(readUserPrefs({ onboarding: { format: "slides" } })).toEqual({});
        expect(readUserPrefs({ onboarding: { format: "" } })).toEqual({});
    });

    // absent rather than {}, so "has this account onboarded" stays a presence test
    it("omits the branch entirely when nothing in it survives", () => {
        expect(readUserPrefs({ onboarding: {} })).toEqual({});
        expect(readUserPrefs({ onboarding: { nope: 1 } })).toEqual({});
        expect(readUserPrefs({ onboarding: "deck" })).toEqual({});
        expect(readUserPrefs({ onboarding: null })).toEqual({});
    });

    it("keeps the two branches independent", () => {
        expect(readUserPrefs({ appTheme: "studio", onboarding: { format: "doc" } })).toEqual({
            appTheme: "studio",
            onboarding: { format: "doc" },
        });
    });
});

describe("mergeUserPrefs — the onboarding branch", () => {
    // the reason the branch merges field by field: dismissing must not wipe the format answer
    it("merges into an existing branch rather than replacing it", () => {
        expect(
            mergeUserPrefs(
                { onboarding: { format: "deck", startedAt: "x" } },
                { onboarding: { dismissed: true } },
            ),
        ).toEqual({ onboarding: { format: "deck", startedAt: "x", dismissed: true } });
    });

    it("overwrites a field the patch carries", () => {
        expect(
            mergeUserPrefs({ onboarding: { format: "deck" } }, { onboarding: { format: "web" } }),
        ).toEqual({ onboarding: { format: "web" } });
    });

    it("clears the whole branch on an explicit null", () => {
        expect(
            mergeUserPrefs(
                { appTheme: "studio", onboarding: { format: "deck" } },
                { onboarding: null },
            ),
        ).toEqual({ appTheme: "studio" });
    });

    it("refuses a patch whose branch is entirely malformed", () => {
        const current = { onboarding: { format: "deck" as const } };
        expect(mergeUserPrefs(current, { onboarding: { format: "slides" } })).toEqual(current);
        expect(mergeUserPrefs(current, { onboarding: 7 })).toEqual(current);
    });

    it("leaves the branch alone when the patch omits it", () => {
        expect(mergeUserPrefs({ onboarding: { format: "doc" } }, { appTheme: "midnight" })).toEqual(
            {
                appTheme: "midnight",
                onboarding: { format: "doc" },
            },
        );
    });
});

// The field's half of the answer. It rules out what is not an address at all; whether the domain
// takes mail is the server's question (domainAcceptsMail), and whether the mailbox exists is the
// confirmation code's.
describe("emailError", () => {
    it("accepts the ordinary shapes, including plus tags and subdomains", () => {
        for (const ok of [
            "a@b.co",
            "ada.lovelace@example.com",
            "ada+galleo@mail.example.co.uk",
            "  spaced@example.com  ",
        ])
            expect(emailError(ok), ok).toBeNull();
    });

    it("refuses what is missing a part, doubled, or spaced", () => {
        for (const bad of [
            "",
            "   ",
            "not-an-email",
            "@example.com",
            "ada@",
            "ada@@example.com",
            "ada@example",
            "ada@.com",
            "ada@example.",
            "ada lovelace@example.com",
            "ada@exa mple.com",
        ])
            expect(emailError(bad), bad).not.toBeNull();
    });

    it("refuses one past the RFC 5321 forward-path limit", () => {
        const local = "a".repeat(MAX_EMAIL - "@example.com".length);
        expect(emailError(`${local}@example.com`)).toBeNull();
        expect(emailError(`${local}a@example.com`)).not.toBeNull();
    });
});

describe("verifyCodeError", () => {
    it("takes six digits, and tolerates the spaces a paste brings", () => {
        expect(verifyCodeError("123456")).toBeNull();
        expect(verifyCodeError("123 456")).toBeNull();
        expect(verifyCodeError(" 000000 ")).toBeNull();
    });

    it("refuses the wrong length, non-digits, and nothing at all", () => {
        for (const bad of ["", "12345", "1234567", "abcdef", "12345a", "-12345"])
            expect(verifyCodeError(bad), bad).not.toBeNull();
    });
});
