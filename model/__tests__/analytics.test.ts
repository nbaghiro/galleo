import { describe, expect, it } from "vitest";
import { asBeatRole, asRequestId, charsBucket, GROUP_TYPE } from "@model/analytics";
import { BEAT_ROLES } from "@model/ai";

describe("charsBucket", () => {
    it("puts each boundary in the bucket that starts at it", () => {
        expect(charsBucket(0)).toBe("0-100");
        expect(charsBucket(99)).toBe("0-100");
        expect(charsBucket(100)).toBe("100-500");
        expect(charsBucket(499)).toBe("100-500");
        expect(charsBucket(500)).toBe("500-2k");
        expect(charsBucket(1_999)).toBe("500-2k");
        expect(charsBucket(2_000)).toBe("2k-10k");
        expect(charsBucket(9_999)).toBe("2k-10k");
        expect(charsBucket(10_000)).toBe("10k+");
        expect(charsBucket(4_000_000)).toBe("10k+");
    });

    // text_edited sends a delta, and a deletion is as interesting as an insertion
    it("buckets a deletion by its magnitude", () => {
        expect(charsBucket(-3_000)).toBe("2k-10k");
        expect(charsBucket(-1)).toBe("0-100");
    });
});

describe("asBeatRole", () => {
    it("accepts every role the planner and the outline editor can produce", () => {
        for (const role of BEAT_ROLES) expect(asBeatRole(role)).toBe(role);
    });

    // The model supplies the role and can invent one, so an unrecognised value carries no property
    // rather than a made-up one.
    it("drops anything that is not a role", () => {
        expect(asBeatRole("coda")).toBeUndefined();
        expect(asBeatRole("Scene")).toBeUndefined();
        expect(asBeatRole("")).toBeUndefined();
        expect(asBeatRole(undefined)).toBeUndefined();
    });
});

describe("the group", () => {
    it("rolls up to the workspace, which is the billing entity", () => {
        expect(GROUP_TYPE).toBe("workspace");
    });
});

describe("asRequestId", () => {
    const fresh = (): string => "minted";

    it("keeps an id a caller sent", () => {
        expect(asRequestId("01a02111-73ba-7e8e-9496-cfcc0da04eba", fresh)).toBe(
            "01a02111-73ba-7e8e-9496-cfcc0da04eba",
        );
    });

    // The header is untrusted input, and it lands in a property, so it is replaced rather than
    // passed through when it is not the shape we expect.
    it("replaces anything that is not a plain id", () => {
        expect(asRequestId(undefined, fresh)).toBe("minted");
        expect(asRequestId("", fresh)).toBe("minted");
        expect(asRequestId("has spaces", fresh)).toBe("minted");
        expect(asRequestId("<script>", fresh)).toBe("minted");
        expect(asRequestId("x".repeat(65), fresh)).toBe("minted");
    });
});
