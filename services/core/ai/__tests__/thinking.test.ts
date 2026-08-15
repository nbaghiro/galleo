import { describe, expect, it } from "vitest";
import { thinkingSteps } from "@services/core/ai/thinking";

// what a Gemini thought summary actually looks like: a bold step name, then prose about it
const summary = `**Analyzing the Request**

The user wants sections 2 through 5 written from the existing outline. I should look at which
beats are already written before doing anything.

**Choosing the Tool**

Since these beats are planned but not yet written, write-section is the right call here.`;

describe("thinkingSteps", () => {
    it("keeps only the model's own step headings, not the prose under them", () => {
        expect(thinkingSteps(summary)).toEqual(["Analyzing the Request", "Choosing the Tool"]);
    });

    it("ignores a heading that is still streaming, so a step never changes under the user", () => {
        expect(
            thinkingSteps("**Analyzing the Request**\n\nsome prose\n\n**Choosing the To"),
        ).toEqual(["Analyzing the Request"]);
    });

    it("grows monotonically as the buffer fills, so the caller can send only what's new", () => {
        const partial = summary.slice(0, summary.indexOf("**Choosing"));
        const early = thinkingSteps(partial);
        const late = thinkingSteps(summary);
        expect(late.slice(0, early.length)).toEqual(early);
        expect(late.length).toBeGreaterThan(early.length);
    });

    it("de-duplicates a heading the model repeats", () => {
        expect(thinkingSteps("**Checking**\n\na\n\n**Checking**\n\nb")).toEqual(["Checking"]);
    });

    it("falls back to the opening sentence of finished paragraphs when there are no headings", () => {
        const plain =
            "I need to read the outline first. Then decide.\n\nNow I will call the tool.\n\n";
        expect(thinkingSteps(plain)).toEqual([
            "I need to read the outline first",
            "Now I will call the tool",
        ]);
    });

    it("never emits the paragraph still being written in the fallback path", () => {
        expect(thinkingSteps("First thought is done.\n\nSecond one is only half")).toEqual([
            "First thought is done",
        ]);
    });

    it("clips a long heading to one line and strips markdown noise", () => {
        const long = `**${"Considering the many possible approaches to this particular request".padEnd(80, "!")}**`;
        const [step] = thinkingSteps(long);
        expect(step!.length).toBeLessThanOrEqual(56);
        expect(step).toContain("…");
        expect(step).not.toContain("*");
    });

    it("is empty until there's a complete step, so nothing half-formed ships", () => {
        expect(thinkingSteps("")).toEqual([]);
        expect(thinkingSteps("**Analy")).toEqual([]);
        expect(thinkingSteps("a partial sentence with no end")).toEqual([]);
    });
});
