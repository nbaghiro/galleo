import { describe, expect, it } from "vitest";
import {
    asRole,
    cleanDisplayName,
    MAX_NAME_LEN,
    mergeUserPrefs,
    readUserPrefs,
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
