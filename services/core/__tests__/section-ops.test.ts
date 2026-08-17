import { describe, expect, it } from "vitest";
import { isSectionOp } from "@services/core/artifacts";

const root = { type: "text", data: { text: "hi" } };
const section = { id: "s1", root };

describe("isSectionOp", () => {
    it("accepts the ops the editor actually sends", () => {
        expect(isSectionOp({ kind: "set", section })).toBe(true);
        expect(isSectionOp({ kind: "insert", section, index: 2 })).toBe(true);
        expect(isSectionOp({ kind: "remove", id: "s1" })).toBe(true);
        expect(isSectionOp({ kind: "order", ids: ["s1", "s2"] })).toBe(true);
        expect(isSectionOp({ kind: "shell", shell: {} })).toBe(true);
    });

    it("keeps accepting a section carrying fields the guard does not enumerate", () => {
        const framed = { ...section, frame: { kind: "card" }, bleed: true };
        expect(isSectionOp({ kind: "set", section: framed })).toBe(true);
    });

    // an unindexed insert used to pass, then reach Math.trunc as NaN and prepend at 0
    it("rejects an insert with no usable index", () => {
        expect(isSectionOp({ kind: "insert", section })).toBe(false);
        expect(isSectionOp({ kind: "insert", section, index: "2" })).toBe(false);
        expect(isSectionOp({ kind: "insert", section, index: Number.NaN })).toBe(false);
    });

    it("rejects a section with no content tree", () => {
        expect(isSectionOp({ kind: "set", section: { id: "s1" } })).toBe(false);
        expect(isSectionOp({ kind: "set", section: { id: "s1", root: null } })).toBe(false);
        expect(isSectionOp({ kind: "set", section: { id: "s1", root: { data: {} } } })).toBe(false);
        expect(isSectionOp({ kind: "insert", section: { id: "s1" }, index: 0 })).toBe(false);
    });

    it("rejects a section with no id", () => {
        expect(isSectionOp({ kind: "set", section: { root } })).toBe(false);
    });

    it("rejects malformed envelopes", () => {
        expect(isSectionOp(null)).toBe(false);
        expect(isSectionOp("set")).toBe(false);
        expect(isSectionOp({})).toBe(false);
        expect(isSectionOp({ kind: "nope", section })).toBe(false);
        expect(isSectionOp({ kind: "order", ids: ["s1", 2] })).toBe(false);
        expect(isSectionOp({ kind: "remove" })).toBe(false);
    });
});
