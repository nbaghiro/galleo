import { describe, expect, it } from "vitest";
import {
    AI_TASKS,
    COST_UNITS,
    costOf,
    creditsForUsd,
    describeUsage,
    unitMultipliers,
} from "@model/credits";
import {
    isToolScope,
    PRICED_TOOLS,
    SCOPE_LABEL,
    scopeFor,
    scopesForTools,
    TOOL_SCOPES,
    TOOLS,
    costRange,
    estimateCost,
    isMetered,
    reserveCost,
    sectionsForLength,
    typicalCost,
    usageFor,
} from "@model/tools";
import type { CostUnit } from "@model/credits";

// Unit prices: plan 3 · section 2 · image 5 · text 1.

describe("costOf", () => {
    it("floors an empty bag at 1 so nothing is free", () => {
        expect(costOf({})).toBe(1);
    });
    it("sums unit price × count (1 plan + 12 sections + 3 images = 42)", () => {
        expect(costOf({ plan: 1, section: 12, image: 3 })).toBe(42);
    });
});

describe("describeUsage", () => {
    it("renders a human breakdown, pluralizing counts > 1", () => {
        expect(describeUsage({ plan: 1, section: 12, image: 3 })).toBe(
            "1 plan · 12 sections · 3 images",
        );
    });
    it("renders an em dash for an empty bag", () => {
        expect(describeUsage({})).toBe("—");
    });
});

describe("creditsForUsd", () => {
    it("converts provider spend at the derived credit price", () => {
        expect(creditsForUsd(0.384)).toBe(27);
    });
    it("floors a real call at 1 credit rather than free", () => {
        expect(creditsForUsd(0.000001)).toBe(1);
    });
});

const rate =
    (map: Record<string, number>) =>
    (id: string): number | undefined =>
        map[id];

describe("unitMultipliers", () => {
    it("prices each unit by the model behind its task", () => {
        const rates = unitMultipliers(
            (t) => ({ outline: "big", section: "small" })[t as string],
            rate({ big: 3, small: 0.5 }),
        );
        expect(rates).toEqual({ plan: 3, section: 0.5 });
    });

    it("omits a unit priced at the baseline, so an untouched run carries no rates at all", () => {
        expect(unitMultipliers(() => "flash", rate({ flash: 1 }))).toEqual({});
    });

    it("leaves media units alone: they run on their own models", () => {
        const rates = unitMultipliers(() => "big", rate({ big: 4 }));
        expect(rates.image).toBeUndefined();
        expect(rates.video).toBeUndefined();
    });

    it("falls back to the baseline for a model with no price", () => {
        expect(unitMultipliers(() => "unknown", rate({}))).toEqual({});
    });

    it("backs every non-media unit with a task, and asks for a real one", () => {
        const asked: string[] = [];
        const rates = unitMultipliers(
            (t) => {
                asked.push(t);
                return "m";
            },
            rate({ m: 2 }),
        );
        const priced = (Object.keys(COST_UNITS) as CostUnit[]).filter((u) => rates[u]);
        expect(priced.sort()).toEqual(["plan", "reply", "section", "text", "theme"]);
        for (const t of asked) expect(AI_TASKS).toContain(t);
    });
});

describe("costOf with rates", () => {
    it("bills a pinned step at its multiple", () => {
        expect(costOf({ section: 10 })).toBe(20);
        expect(costOf({ section: 10 }, { section: 2.93 })).toBe(59);
    });

    it("charges the old price when nothing is pinned", () => {
        const usage = { plan: 1, section: 12, image: 3 };
        expect(costOf(usage, {})).toBe(costOf(usage));
    });

    it("scales only the pinned unit", () => {
        expect(costOf({ plan: 1, section: 12 }, { plan: 3 })).toBe(3 * 3 + 12 * 2);
    });

    it("still floors at 1 so nothing is free", () => {
        expect(costOf({ text: 1 }, { text: 0.14 })).toBe(1);
    });
});

describe("estimateCost", () => {
    it("scales generate-artifact by the intake length (1 plan + 7 sections = 17)", () => {
        expect(estimateCost("generate-artifact", { length: "Short" })).toBe(17);
    });
    it("uses the default size when nothing is passed (1 plan + 12 sections = 27)", () => {
        expect(estimateCost("generate-artifact", {})).toBe(27);
    });
    it("honors an explicit section count (1 plan + 20 sections = 43)", () => {
        expect(estimateCost("generate-artifact", { sections: 20 })).toBe(43);
    });
    it("meters AI images per image, while stock ones stay free", () => {
        // Short + AI sources 2 images: 3 + 14 + 2 × 5 = 27, and they scale with the image rate
        expect(estimateCost("generate-artifact", { length: "Short", imageSource: "ai" })).toBe(27);
        expect(
            estimateCost("generate-artifact", { length: "Short", imageSource: "ai" }, { image: 2 }),
        ).toBe(37);
        expect(estimateCost("generate-artifact", { length: "Short" }, { image: 2 })).toBe(17);
    });
    it("quotes a whole generation at the picked model's rate", () => {
        const flat = estimateCost("generate-artifact", { sections: 12 });
        const heavy = estimateCost("generate-artifact", { sections: 12 }, { plan: 3, section: 3 });
        expect(heavy).toBeGreaterThan(flat * 2.5);
    });
});

describe("typicalCost", () => {
    it("prices a headline generate with its typical AI images", () => {
        expect(typicalCost("generate-artifact")).toBe(42);
    });
    it("prices a single added section at 2 credits", () => {
        expect(typicalCost("add-section")).toBe(2);
    });
});

describe("sectionsForLength", () => {
    it("maps length chips to section counts (case-insensitive)", () => {
        expect(sectionsForLength("Short")).toBe(7);
        expect(sectionsForLength("SHORT")).toBe(7);
        expect(sectionsForLength("In-depth")).toBe(18);
        expect(sectionsForLength("deep")).toBe(18);
        expect(sectionsForLength("Standard")).toBe(12);
        expect(sectionsForLength(undefined)).toBe(12);
    });
});

describe("studio tools", () => {
    it("plan-outline is a live, direct, plan-priced step (the outline gate charges it)", () => {
        const t = TOOLS["plan-outline"];
        expect(t.surfaces).toContain("direct");
        expect(t.live).toBe(true);
        expect(estimateCost("plan-outline")).toBe(3);
    });
    it("keeps the composition primitives off every caller-facing surface", () => {
        for (const id of ["plan-section", "write-section", "check-section", "pick-arc"] as const)
            expect(TOOLS[id].surfaces).toEqual(["internal"]);
        expect(TOOLS["reorder-section"].surfaces).not.toContain("internal");
    });
});

describe("costRange / isMetered", () => {
    it("collapses to a point for a fixed-cost tool", () => {
        const range = costRange("add-section");
        expect(range.min).toBe(range.max);
        expect(isMetered("add-section")).toBe(false);
    });
    it("spans small → large for a metered tool", () => {
        const range = costRange("generate-artifact");
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(isMetered("generate-artifact")).toBe(true);
    });
});

describe("free tools", () => {
    // action tools that move or rename something: no model call, so nothing to bill
    const FREE = ["reorder-section", "remove-section", "set-format", "set-theme"] as const;

    it.each(FREE)("%s reserves nothing, despite costOf's 1-credit floor", (id) => {
        expect(estimateCost(id)).toBe(0);
        expect(typicalCost(id)).toBe(0);
        expect(costRange(id)).toEqual({ min: 0, max: 0 });
    });

    it("keeps them off the credits table", () => {
        const listed = PRICED_TOOLS.map((t) => t.id);
        for (const id of FREE) expect(listed).not.toContain(id);
    });
});

describe("the credits table", () => {
    it("prices every action it lists", () => {
        for (const t of PRICED_TOOLS) expect(estimateCost(t.id)).toBeGreaterThan(0);
    });

    it("lists exactly the actions we bill for", () => {
        expect(PRICED_TOOLS.map((t) => t.id).sort()).toEqual([
            "add-section",
            "ask-assistant",
            "audition-voice",
            "compose-soundtrack",
            "design-voice",
            "draft-brief",
            "edit-artifact",
            "generate-artifact",
            "generate-image",
            "generate-theme",
            "generate-video",
            "narrate-artifact",
            "plan-outline",
            "refine-prompt",
            "revise-element",
            "rewrite-passage",
            "rewrite-section",
            "rewrite-text",
            "suggest-section-layouts",
            "translate-text",
            "write-speaker-notes",
        ]);
    });

    it("prices the media actions apart from the text ones", () => {
        expect(typicalCost("generate-image")).toBe(COST_UNITS.image);
        expect(typicalCost("generate-video")).toBe(COST_UNITS.video);
    });
});

describe("what the gate holds", () => {
    it("holds the estimate when a tool has no ceiling", () => {
        expect(reserveCost("add-section")).toBe(estimateCost("add-section"));
        expect(reserveCost("generate-artifact", { length: "Short" })).toBe(
            estimateCost("generate-artifact", { length: "Short" }),
        );
    });

    it("holds more than it shows for a chat turn, whose tool loop has no bound", () => {
        expect(estimateCost("ask-assistant")).toBe(2);
        expect(reserveCost("ask-assistant")).toBe(10);
    });

    it("keeps the shown price out of the ceiling, so the table is unaffected", () => {
        expect(typicalCost("ask-assistant")).toBe(2);
    });

    it("prices a ceiling against the caller's models too", () => {
        expect(reserveCost("ask-assistant", {}, { reply: 3 })).toBe(30);
    });

    it("never holds anything for a free tool", () => {
        expect(reserveCost("reorder-section")).toBe(0);
    });
});

describe("usageFor", () => {
    it("reports the units a fixed-cost tool is made of", () => {
        expect(usageFor("add-section")).toEqual({ section: 1 });
    });

    it("scales a metered tool to the job, which is what the ledger records", () => {
        expect(usageFor("generate-artifact", { length: "Short", imageSource: "ai" })).toEqual({
            plan: 1,
            section: 7,
            image: 2,
        });
    });

    it("renders that into the breakdown history shows", () => {
        expect(describeUsage(usageFor("generate-artifact", { length: "Short" }))).toBe(
            "1 plan · 7 sections",
        );
    });
});

describe("describeUsage", () => {
    it("names the speech unit in words, since the key's plural is not one", () => {
        expect(describeUsage({ speech: 9 })).toBe("9k characters spoken");
        expect(describeUsage({ speech: 1 })).toBe("1k characters spoken");
    });

    it("still pluralizes the ordinary units", () => {
        expect(describeUsage({ section: 1 })).toBe("1 section");
        expect(describeUsage({ section: 3, image: 2 })).toBe("3 sections · 2 images");
        expect(describeUsage({ reply: 2 })).toBe("2 replies");
    });

    it("is a dash for nothing, so a ledger row is never blank", () => {
        expect(describeUsage({})).toBe("—");
    });
});

// The permission half of the catalog. It lives beside the pricing because both answer "what does
// this tool cost you", one in credits and one in trust.
describe("scopeFor", () => {
    it("reads a tool's effect when that is enough to say", () => {
        expect(scopeFor("read-artifact")).toBe("artifacts:read");
        expect(scopeFor("add-section")).toBe("artifacts:write");
        expect(scopeFor("trash-artifact")).toBe("artifacts:delete");
    });

    // sharing is a write that needs its own permission, and restoring is a write that belongs with
    // the trash: neither is something three effects can express
    it("takes the tool's own answer where effect cannot give one", () => {
        expect(scopeFor("share-artifact")).toBe("artifacts:share");
        expect(scopeFor("restore-artifact")).toBe("artifacts:delete");
    });

    // the fallback leans restrictive on purpose: forgetting to annotate must not widen a token
    it("falls back to write, never to read", () => {
        const unannotated = Object.values(TOOLS).filter((t) => !t.effect && !t.scope);
        expect(unannotated.length).toBeGreaterThan(0);
        for (const t of unannotated) expect(scopeFor(t.id)).toBe("artifacts:write");
    });

    it("resolves every tool to one of the four", () => {
        for (const t of Object.values(TOOLS)) expect(isToolScope(scopeFor(t.id))).toBe(true);
    });
});

describe("scopesForTools", () => {
    it("collapses a set of tools to the permissions it needs, in catalog order", () => {
        expect(scopesForTools(["trash-artifact", "read-artifact", "add-section"])).toEqual([
            "artifacts:read",
            "artifacts:write",
            "artifacts:delete",
        ]);
    });

    it("is empty for nothing", () => {
        expect(scopesForTools([])).toEqual([]);
    });
});

describe("SCOPE_LABEL", () => {
    it("gives every scope a sentence a person can agree to", () => {
        for (const scope of TOOL_SCOPES) {
            expect(SCOPE_LABEL[scope]).toBeTruthy();
            expect(SCOPE_LABEL[scope]).not.toMatch(/artifacts:/);
        }
    });
});
