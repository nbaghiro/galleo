import { describe, expect, it } from "vitest";
import {
    AI_TASKS,
    COST_UNITS_ALL,
    CREDIT_USD,
    DEFAULT_UNIT_PRICES,
    creditsForUsd,
    describeUsage,
    unitPricesFrom,
    usdOfUsage,
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
import type { ToolId } from "@model/tools";

// One rule prices everything: credits = creditsForUsd(sum of unit dollars).
const P = DEFAULT_UNIT_PRICES;

describe("usdOfUsage", () => {
    it("sums unit price × count", () => {
        expect(usdOfUsage({ section: 2, image: 1 }, P)).toBeCloseTo(2 * 0.0181605 + 0.071, 9);
    });
    it("is zero for an empty bag, so nothing spent stays nothing", () => {
        expect(usdOfUsage({}, P)).toBe(0);
    });
    it("contributes nothing for a unit the caller priced at nothing", () => {
        expect(usdOfUsage({ section: 5 }, {})).toBe(0);
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
    it("converts provider spend at the chosen credit price", () => {
        expect(creditsForUsd(27 * CREDIT_USD)).toBe(27);
    });
    it("floors a real call at 1 credit rather than free", () => {
        expect(creditsForUsd(0.000001)).toBe(1);
    });
});

const price =
    (map: Record<string, number>) =>
    (id: string): number | undefined =>
        map[id];

describe("unitPricesFrom", () => {
    it("prices each unit from the model behind its task", () => {
        const prices = unitPricesFrom(
            (t) => ({ outline: "big", section: "small" })[t as string],
            (id) => price({ big: 0.3, small: 0.05 })(id),
        );
        expect(prices.plan).toBe(0.3);
        expect(prices.section).toBe(0.05);
    });

    it("leaves media units unpriced without a media resolver", () => {
        const prices = unitPricesFrom(() => "big", price({ big: 0.3 }));
        expect(prices.image).toBeUndefined();
        expect(prices.video).toBeUndefined();
    });

    it("prices media units through the media resolver when one is given", () => {
        const prices = unitPricesFrom(
            () => "flash",
            price({ flash: 0.01 }),
            (u) => (u === "image" ? 0.071 : undefined),
        );
        expect(prices.image).toBe(0.071);
        expect(prices.video).toBeUndefined();
    });

    it("drops a model with no price rather than inventing one", () => {
        expect(unitPricesFrom(() => "unknown", price({}))).toEqual({});
    });

    it("backs every non-media unit with a real task", () => {
        const asked: string[] = [];
        const prices = unitPricesFrom(
            (t) => {
                asked.push(t);
                return "m";
            },
            price({ m: 0.02 }),
        );
        const priced = COST_UNITS_ALL.filter((u) => prices[u]);
        expect(priced.sort()).toEqual(["plan", "reply", "section", "text", "theme"]);
        for (const t of asked) expect(AI_TASKS).toContain(t);
    });
});

describe("estimateCost", () => {
    it("scales generate-artifact by the intake length (1 plan + 7 sections)", () => {
        expect(estimateCost("generate-artifact", { length: "Short" }, P)).toBe(58);
    });
    it("uses the default size when nothing is passed (1 plan + 12 sections)", () => {
        expect(estimateCost("generate-artifact", {}, P)).toBe(95);
    });
    it("honors an explicit section count (1 plan + 20 sections)", () => {
        expect(estimateCost("generate-artifact", { sections: 20 }, P)).toBe(153);
    });
    it("meters AI images per image, while stock ones stay free", () => {
        // Short + AI sources 2 images, so the pictures add their own dollars on top
        expect(estimateCost("generate-artifact", { length: "Short", imageSource: "ai" }, P)).toBe(
            115,
        );
        expect(estimateCost("generate-artifact", { length: "Short" }, P)).toBe(58);
    });
    it("quotes a whole generation at the picked model's price", () => {
        const cheap = estimateCost("generate-artifact", { sections: 12 }, P);
        const heavy = estimateCost(
            "generate-artifact",
            { sections: 12 },
            { ...P, plan: P.plan! * 3, section: P.section! * 3 },
        );
        expect(heavy).toBeGreaterThan(cheap * 2.5);
    });
    it("agrees with what the settle would charge for exactly those units", () => {
        const usage = { plan: 1, section: 12 };
        expect(estimateCost("generate-artifact", { sections: 12 }, P)).toBe(
            creditsForUsd(usdOfUsage(usage, P)),
        );
    });
});

describe("typicalCost", () => {
    // AI images are opt-in at the intake form, so the headline is the stock-photo path
    it("prices a headline generate on the stock-photo default", () => {
        expect(typicalCost("generate-artifact", P)).toBe(95);
    });
    it("adds the images only when the run opts into AI ones", () => {
        expect(estimateCost("generate-artifact", { sections: 12, imageSource: "stock" }, P)).toBe(
            95,
        );
        expect(
            estimateCost("generate-artifact", { sections: 12, imageSource: "ai", images: 3 }, P),
        ).toBe(180);
    });
    it("floors a sub-cent action at one credit rather than free", () => {
        expect(typicalCost("add-section", P)).toBe(7);
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
        expect(estimateCost("plan-outline", {}, P)).toBe(8);
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

    it.each(FREE)("%s reserves nothing, despite the 1-credit floor on a real call", (id) => {
        expect(estimateCost(id)).toBe(0);
        expect(typicalCost(id)).toBe(0);
        expect(costRange(id)).toEqual({ min: 0, max: 0 });
    });

    it("keeps them off the credits table", () => {
        const listed = PRICED_TOOLS.map((t) => t.id);
        for (const id of FREE) expect(listed).not.toContain(id);
    });

    // `free` zeroes a tool's cost, so a tool carrying both would silently give away a real charge.
    // check:tools enforces the other half, that a tool with a body declares one of the two.
    it("never marks a priced tool free", () => {
        const both = (Object.keys(TOOLS) as ToolId[]).filter(
            (id) => TOOLS[id].free === true && (TOOLS[id].usage || TOOLS[id].meter),
        );
        expect(both).toEqual([]);
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
            // a vision pass over a scan; the text-layer branch beside it stays free
            "read-file",
            "refine-prompt",
            "revise-element",
            "rewrite-passage",
            "rewrite-section",
            "rewrite-text",
            "suggest-section-layouts",
            // it calls a model on every use; it billed nothing until the free-by-omission fix
            "suggest-sections",
            "translate-text",
            "write-speaker-notes",
        ]);
    });

    it("prices the media actions from their own models, far apart from the text ones", () => {
        expect(typicalCost("generate-image", P)).toBe(creditsForUsd(P.image!));
        expect(typicalCost("generate-video", P)).toBe(creditsForUsd(P.video!));
        expect(typicalCost("generate-video", P)).toBeGreaterThan(typicalCost("generate-image", P));
    });
});

describe("what the gate holds", () => {
    it("holds the estimate when a tool has no ceiling", () => {
        expect(reserveCost("add-section", {}, P)).toBe(estimateCost("add-section", {}, P));
        expect(reserveCost("generate-artifact", { length: "Short" }, P)).toBe(
            estimateCost("generate-artifact", { length: "Short" }, P),
        );
    });

    it("holds more than it shows for a chat turn, whose tool loop has no bound", () => {
        expect(reserveCost("ask-assistant", {}, P)).toBeGreaterThan(
            estimateCost("ask-assistant", {}, P),
        );
        expect(reserveCost("ask-assistant", {}, P)).toBe(creditsForUsd(5 * P.reply!));
    });

    it("keeps the shown price out of the ceiling, so the table is unaffected", () => {
        expect(typicalCost("ask-assistant", P)).toBe(creditsForUsd(P.reply!));
    });

    it("prices a ceiling against the caller's models too", () => {
        const dear = { ...P, reply: P.reply! * 10 };
        expect(reserveCost("ask-assistant", {}, dear)).toBe(creditsForUsd(5 * dear.reply));
        expect(reserveCost("ask-assistant", {}, dear)).toBeGreaterThan(
            9 * reserveCost("ask-assistant", {}, P),
        );
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
