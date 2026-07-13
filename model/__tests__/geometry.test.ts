import { describe, expect, it } from "vitest";
import { fit, fixed, grow, percent } from "@model/geometry";

describe("fit / grow", () => {
    it("fit carries min + max when given", () => {
        expect(fit(1, 2)).toEqual({ mode: "fit", min: 1, max: 2 });
    });
    it("fit leaves min + max undefined when omitted", () => {
        const f = fit();
        expect(f).toEqual({ mode: "fit" });
        if (f.mode === "fit") {
            expect(f.min).toBeUndefined();
            expect(f.max).toBeUndefined();
        }
    });
    it("grow carries its bounds", () => {
        expect(grow(3)).toEqual({ mode: "grow", min: 3 });
        expect(grow()).toEqual({ mode: "grow" });
    });
});

describe("percent / fixed", () => {
    it("percent wraps a value", () => {
        expect(percent(50)).toEqual({ mode: "percent", value: 50 });
    });
    it("fixed wraps a value", () => {
        expect(fixed(320)).toEqual({ mode: "fixed", value: 320 });
    });
});
