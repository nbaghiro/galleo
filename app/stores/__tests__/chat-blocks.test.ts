import { describe, expect, it } from "vitest";
import type { UIBlock } from "../chat-blocks";
import { textInsertAt } from "../chat-blocks";

const text = (t: string): UIBlock => ({ k: "text", text: t });
const tool = (id: string): UIBlock => ({ k: "tool", blockId: id, tool: id, title: id, done: true });
const widget = (id: string): UIBlock => ({
    k: "widget",
    blockId: id,
    block: { type: "suggestions", items: ["a"] },
});

describe("textInsertAt", () => {
    it("appends when nothing trails", () => {
        expect(textInsertAt([text("hi"), tool("t1")])).toBe(2);
    });

    it("puts prose above a card the tool already returned", () => {
        expect(textInsertAt([tool("t1"), widget("t1")])).toBe(1);
    });

    it("clears a whole run of trailing cards", () => {
        expect(textInsertAt([tool("t1"), widget("t1"), widget("t2")])).toBe(1);
    });

    it("stops at the done tool shell, so a later run does not merge into the first", () => {
        expect(textInsertAt([text("first"), tool("t1"), widget("t1")])).toBe(2);
    });

    it("continues the run when the prose is directly above the card", () => {
        expect(textInsertAt([tool("t1"), text("first"), widget("t1")])).toBe(2);
    });

    it("handles an empty message", () => {
        expect(textInsertAt([])).toBe(0);
    });
});
