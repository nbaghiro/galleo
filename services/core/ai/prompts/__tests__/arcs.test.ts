import { describe, it, expect } from "vitest";
import type { GenerateInput } from "@model/ai";
import { ARCS, arcGuidance, chooseArc } from "@services/core/ai/prompts/arcs";

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
        expect(chooseArc("teach", "web")).toBe(ARCS.marketing);
    });
    it("falls back to marketing for a bare web surface", () => {
        expect(chooseArc(undefined, "web")).toBe(ARCS.marketing);
    });
    it("routes an invitation goal to the event arc, ahead of the web fallback", () => {
        for (const goal of ["an event page", "wedding invite", "rsvp page", "our conference"])
            expect(chooseArc(goal, "web")).toBe(ARCS.event);
    });
    it("routes a portfolio or personal-site goal to the creative arc", () => {
        for (const goal of ["my portfolio", "a personal site", "resume site"])
            expect(chooseArc(goal, "web")).toBe(ARCS.creative);
    });
    it("falls back to the generic arc when nothing matches", () => {
        expect(chooseArc(undefined, "deck")).toBe(ARCS.generic);
        expect(chooseArc("whatever", "deck")).toBe(ARCS.generic);
    });
    it("reads the pitch off the words a raise actually uses, not only the word pitch", () => {
        for (const text of [
            "a launch deck for Tidewell, for Series A investors",
            "raising a seed round",
            "our fundraising story for VCs",
        ])
            expect(chooseArc(text, "deck")).toBe(ARCS.pitch);
    });
    it("reaches the proposal arc, which nothing routed to before", () => {
        expect(chooseArc("a proposal for the Aster account", "deck")).toBe(ARCS.proposal);
        expect(chooseArc("client update, Q3", "doc")).toBe(ARCS.proposal);
    });
    it("matches whole words, so a raised bed is not a raise", () => {
        expect(chooseArc("a guide to raised garden beds", "doc")).toBe(ARCS.generic);
    });
});

describe("arcGuidance", () => {
    it("reads the prompt as well as the goal, since the goal is empty when the planner runs", () => {
        const input: GenerateInput = {
            prompt: "A launch deck for Tidewell, a Lisbon startup. Series A investors.",
            surface: "deck",
            theme: "studio",
        };
        expect(arcGuidance(input)).toContain(ARCS.pitch.label);
    });
});

// Every arc a web brief can land on has to describe the page a site actually is, or the outline
// plans a document and the section writer never gets the chance to build the chrome.
describe("the web arcs describe the site anatomy", () => {
    for (const key of ["marketing", "event", "creative"] as const) {
        it(`${key} opens on the docked topbar and keeps the band rhythm`, () => {
            const { arc, tells } = ARCS[key];
            expect(arc).toContain("topbar");
            expect(`${arc} ${tells}`).toContain("band");
        });
    }

    it("marketing prices with the composite and answers with the faq element", () => {
        expect(ARCS.marketing.arc).toContain("`pricing`");
        expect(ARCS.marketing.arc).toContain("`faq`");
        expect(ARCS.marketing.arc).toContain("`tabs`");
        expect(ARCS.marketing.tells).toContain("#section-id");
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
