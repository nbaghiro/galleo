import { describe, expect, it } from "vitest";
import type { Target } from "@model/target";
import { parentTarget, parseTarget, regionId, specificity, targetsEqual } from "@model/target";

// Tier-A pure: stable addressing of selectable entities. regionId ⇄ parseTarget must round-trip exactly.

const sectionT: Target = { kind: "section", section: "s" };
const elT: Target = { kind: "element", address: { section: "s", path: [0, 1] } };
const elEmpty: Target = { kind: "element", address: { section: "s", path: [] } };

describe("regionId ⇄ parseTarget round-trip", () => {
    it("round-trips a section target", () => {
        expect(parseTarget(regionId(sectionT))).toEqual(sectionT);
    });
    it("round-trips an element with a path", () => {
        expect(parseTarget(regionId(elT))).toEqual(elT);
    });
    it("round-trips an element with an empty path", () => {
        expect(parseTarget(regionId(elEmpty))).toEqual(elEmpty);
    });
});

describe("parseTarget", () => {
    it("parses a dotted element path", () => {
        expect(parseTarget("el:s:0.1")).toEqual({
            kind: "element",
            address: { section: "s", path: [0, 1] },
        });
    });
    it("parses a pathless element as the root", () => {
        expect(parseTarget("el:s")).toEqual({
            kind: "element",
            address: { section: "s", path: [] },
        });
    });
    it("returns null for junk / empty input", () => {
        expect(parseTarget("junk")).toBeNull();
        expect(parseTarget("")).toBeNull();
    });
});

describe("specificity", () => {
    it("is 0 for a section and 1 + path length for an element", () => {
        expect(specificity(sectionT)).toBe(0);
        expect(specificity(elEmpty)).toBe(1);
        expect(specificity(elT)).toBe(3);
    });
    it("ranks deeper elements above shallower ones", () => {
        expect(specificity(elT)).toBeGreaterThan(specificity(elEmpty));
    });
});

describe("parentTarget", () => {
    it("walks a nested element up to its parent element", () => {
        expect(parentTarget(elT)).toEqual({
            kind: "element",
            address: { section: "s", path: [0] },
        });
    });
    it("walks a root element up to its section", () => {
        expect(parentTarget(elEmpty)).toEqual({ kind: "section", section: "s" });
    });
    it("walks a section up to nothing", () => {
        expect(parentTarget(sectionT)).toBeNull();
    });
});

describe("targetsEqual", () => {
    it("compares by region id, treating nulls carefully", () => {
        expect(targetsEqual(null, null)).toBe(true);
        expect(targetsEqual(sectionT, null)).toBe(false);
        expect(targetsEqual(sectionT, { kind: "section", section: "s" })).toBe(true);
        expect(targetsEqual(sectionT, elT)).toBe(false);
    });
});
