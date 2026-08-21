// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { can, reportPaywall } from "@app/stores/features";

describe("reporting a paywall before /features lands", () => {
    // The bug this replaced: `can()` reads false for every feature until /features resolves, and the
    // share modal loads its own features on mount, so every workspace on every plan reported a
    // publicLinks paywall the first time it opened the share panel. The wall event is the one the
    // spec calls highest-value, so a false positive on it is worse than a missing one.
    it("treats an unknown plan as withholding, which is why reporting has to wait", () => {
        expect(can("publicLinks")).toBe(false);
    });

    it("declines to report a wall it cannot vouch for", () => {
        expect(reportPaywall("publicLinks", "pro")).toBe(false);
        expect(reportPaywall("customThemes")).toBe(false);
    });
});
