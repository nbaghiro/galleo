import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@model/ai";
import { threadKey } from "@model/ai";
import { compactEvents } from "@services/core/threads";

describe("threadKey", () => {
    it("names the subject a thread belongs to, generation first", () => {
        expect(threadKey({ generationId: "g1", artifactId: "a1" })).toBe("generation:g1");
        expect(threadKey({ artifactId: "a1" })).toBe("artifact:a1");
        expect(threadKey({})).toBe("library");
    });
});

describe("compactEvents", () => {
    const block: TurnEvent = {
        type: "chat.block",
        blockId: "t1",
        block: { type: "suggestions", items: ["a"] },
    };

    it("folds text deltas into one, keeps the cards, and drops the live paint", () => {
        const out = compactEvents([
            { type: "turn.start", tool: "ask-assistant" },
            { type: "chat.text", delta: "Hel" },
            { type: "chat.text", delta: "lo" },
            { type: "chat.tool", blockId: "t1", tool: "suggest-sections", title: "Ideas" },
            { type: "chat.nested", blockId: "t1", event: { type: "narration", text: "x" } },
            block,
            {
                type: "chat.tool",
                blockId: "t1",
                tool: "suggest-sections",
                title: "Ideas",
                done: true,
            },
            { type: "chat.text", delta: " there" },
            { type: "turn.done" },
        ]);
        expect(out).toEqual([
            { type: "chat.text", delta: "Hello" },
            block,
            {
                type: "chat.tool",
                blockId: "t1",
                tool: "suggest-sections",
                title: "Ideas",
                done: true,
            },
            { type: "chat.text", delta: " there" },
        ]);
    });

    it("keeps the thinking steps in order, flushed before whatever follows", () => {
        const out = compactEvents([
            { type: "chat.thinking" },
            { type: "chat.thinking", label: "Read the deck" },
            { type: "chat.thinking", label: "Pick a tool" },
            { type: "chat.text", delta: "Done." },
        ]);
        expect(out).toEqual([
            { type: "chat.thinking", label: "Read the deck" },
            { type: "chat.thinking", label: "Pick a tool" },
            { type: "chat.text", delta: "Done." },
        ]);
    });

    it("keeps an error line, so a failed turn reads the same reopened", () => {
        expect(compactEvents([{ type: "error", message: "boom" }])).toEqual([
            { type: "error", message: "boom" },
        ]);
    });
});
