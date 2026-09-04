import { describe, expect, it } from "vitest";
import type { ChatThread } from "@model/ai";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { appendExchange } from "@services/core/threads";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { eq } from "drizzle-orm";

const threadOf = async (userId: string, key: string): Promise<ChatThread | null> => {
    const res = await authed(userId, `/chat/thread?key=${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { thread: ChatThread | null }).thread;
};

describe("the chat thread", () => {
    it("401s without a session and refuses a key of the wrong shape", async () => {
        expect((await request("/chat/thread?key=library")).status).toBe(401);
        const { userId } = await seedUser();
        expect((await authed(userId, "/chat/thread?key=nope:1")).status).toBe(400);
    });

    it("is empty until a turn is appended, then comes back compacted with its marks", async () => {
        const { userId, workspaceId } = await seedUser();
        expect(await threadOf(userId, "library")).toBeNull();

        await appendExchange(workspaceId, userId, "library", "make me a deck", [
            { type: "chat.text", delta: "Sure" },
            { type: "chat.text", delta: ", here" },
            {
                type: "chat.block",
                blockId: "t1",
                block: {
                    type: "proposal",
                    id: "p1",
                    tool: "start-generation",
                    summary: "Start a deck",
                    call: { input: { prompt: "a deck" } },
                },
            },
        ]);
        const first = await threadOf(userId, "library");
        expect(first?.messages).toHaveLength(2);
        expect(first?.messages[0]).toMatchObject({ role: "user", text: "make me a deck" });
        expect(first?.messages[1]).toMatchObject({
            role: "assistant",
            events: [{ type: "chat.text", delta: "Sure, here" }, expect.anything()],
        });

        const marked = await authed(
            userId,
            "/chat/thread/mark",
            jsonInit("POST", { key: "library", proposal: "p1", mark: "applied" }),
        );
        expect(marked.status).toBe(200);
        expect((await threadOf(userId, "library"))?.marks).toEqual({ p1: "applied" });

        // one thread per subject: the artifact's is a different one
        expect(await threadOf(userId, "artifact:abc")).toBeNull();

        expect(
            (await authed(userId, "/chat/thread?key=library", { method: "DELETE" })).status,
        ).toBe(200);
        expect(await threadOf(userId, "library")).toBeNull();
        const rows = await db
            .select()
            .from(schema.chatThreads)
            .where(eq(schema.chatThreads.userId, userId));
        expect(rows).toHaveLength(0);
    });
});
