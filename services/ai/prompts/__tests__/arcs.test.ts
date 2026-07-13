import { describe, it, expect } from "vitest";
import type { GenerateInput } from "@model/ai";
import { ARCS, arcGuidance, chooseArc } from "../arcs";

describe("chooseArc", () => {
    it("routes a pitch goal to the pitch arc", () => {
        expect(chooseArc("pitch deck")).toBe(ARCS.pitch);
    });
    it("routes sell/sale to marketing on web, sales elsewhere", () => {
        expect(chooseArc("sell", "web")).toBe(ARCS.marketing);
        expect(chooseArc("sell", "deck")).toBe(ARCS.sales);
        expect(chooseArc("make a sale", "doc")).toBe(ARCS.sales);
    });
    it("routes a report goal to the report arc", () => {
        expect(chooseArc("report", "deck")).toBe(ARCS.report);
    });
    it("prefers the report goal over the web surface (goal checked first)", () => {
        expect(chooseArc("report", "web")).toBe(ARCS.report);
    });
    it("routes an announce goal to marketing", () => {
        expect(chooseArc("announce")).toBe(ARCS.marketing);
    });
    it("routes teach/inform to report only when the surface is not web", () => {
        expect(chooseArc("teach", "deck")).toBe(ARCS.report);
        expect(chooseArc("inform", "doc")).toBe(ARCS.report);
        // the web surface is matched before teach/inform
        expect(chooseArc("teach", "web")).toBe(ARCS.marketing);
    });
    it("falls back to marketing for a bare web surface", () => {
        expect(chooseArc(undefined, "web")).toBe(ARCS.marketing);
    });
    it("falls back to the generic arc when nothing matches", () => {
        expect(chooseArc(undefined, "deck")).toBe(ARCS.generic);
        expect(chooseArc("whatever", "deck")).toBe(ARCS.generic);
    });
});

describe("arcGuidance", () => {
    it("wraps the chosen arc's label, sequence, and tells", () => {
        const input: GenerateInput = {
            prompt: "P",
            surface: "deck",
            theme: "studio",
            goal: "pitch",
        };
        const out = arcGuidance(input);
        expect(out).toContain("Design the structure");
        expect(out).toContain(ARCS.pitch.label);
        expect(out).toContain(ARCS.pitch.arc);
        expect(out).toContain(ARCS.pitch.tells);
    });
});
