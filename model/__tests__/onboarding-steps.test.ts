import { describe, expect, it } from "vitest";
import { newlyDone } from "@model/workspace";

describe("newlyDone", () => {
    // The bug this replaced: the first read of a session compared against an empty baseline, so a
    // user who had finished the checklist days ago re-reported every step on every page load. Two
    // loads of a four-step checklist produced eight events, which would have made the activation
    // funnel unreadable.
    it("reports nothing on the first read, whatever is already done", () => {
        expect(newlyDone(undefined, ["make", "ai", "theme", "send"])).toEqual([]);
        expect(newlyDone(undefined, [])).toEqual([]);
    });

    it("reports only what crossed since the last read", () => {
        expect(newlyDone([], ["make"])).toEqual(["make"]);
        expect(newlyDone(["make"], ["make", "ai"])).toEqual(["ai"]);
        expect(newlyDone(["make", "ai"], ["make", "ai"])).toEqual([]);
    });

    // A re-read that comes back with less than we had is not a step "un-crossing".
    it("says nothing when a step disappears", () => {
        expect(newlyDone(["make", "ai"], ["make"])).toEqual([]);
    });
});
