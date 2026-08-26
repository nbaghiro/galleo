// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent, TurnRequest } from "@model/ai";

// The seam is the turn stream: everything above it is the real store, so what this proves is how a
// build actually behaves when one beat never lands, not a restatement of the loop.
const streamTurn = vi.fn();

vi.mock("@app/api", () => ({
    streamTurn,
    setTraceSession: vi.fn(),
    api: { saveGenerated: vi.fn() },
    ApiError: class extends Error {},
}));
vi.mock("@app/stores/billing", () => ({ loadBilling: vi.fn() }));
vi.mock("@app/stores/chat", () => ({ bindChatTarget: vi.fn(), resetThread: vi.fn() }));
vi.mock("@app/stores/library", () => ({
    persistArtifact: vi.fn(async () => null),
    updateArtifactContent: vi.fn(async () => undefined),
}));
vi.mock("@ui/analytics", () => ({ capture: vi.fn(), setRequestId: vi.fn() }));
vi.mock("@app/stores/theme", () => ({ appTheme: () => "aurora" }));

const { buildSectionNow, gen, startSession, startBuild } = await import("@app/stores/generate");

const PLAN: TurnEvent[] = [
    { type: "turn.start", kind: "plan" },
    {
        type: "plan",
        title: "Three beats",
        beats: [
            { id: "s1", label: "Open", role: "scene" },
            { id: "s2", label: "Proof", role: "proof" },
            { id: "s3", label: "Close", role: "close" },
        ],
    },
    { type: "turn.done", summary: "planned" },
];

const written = (id: string, afterId: string | null): TurnEvent[] => [
    { type: "turn.start", kind: "build" },
    { type: "section.status", id, status: "writing" },
    {
        type: "patch",
        ops: [
            {
                op: "addSection",
                afterId,
                section: {
                    id,
                    root: { type: "text", data: { text: `${id} copy`, style: "h1" } },
                },
            },
        ],
    },
    { type: "section.status", id, status: "done" },
    { type: "turn.done", summary: "placed" },
];

// a turn that opens, says nothing, and ends: the shape of a section that never comes back
const empty = (id: string): TurnEvent[] => [
    { type: "turn.start", kind: "build" },
    { type: "section.status", id, status: "writing" },
    { type: "turn.done", summary: "nothing" },
];

describe("a beat that never lands", () => {
    beforeEach(() => {
        streamTurn.mockReset(); // a block, not an expression: a returned function is teardown
    });

    it("is marked failed and the rest of the piece is still written", async () => {
        const seen: string[] = [];
        streamTurn.mockImplementation(async (req: TurnRequest, onEvent: (e: TurnEvent) => void) => {
            if (req.kind !== "build") {
                PLAN.forEach(onEvent);
                return;
            }
            const id = req.input.beat.id;
            seen.push(id);
            const script = id === "s2" ? empty(id) : written(id, id === "s1" ? null : "s1");
            script.forEach(onEvent);
        });

        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        startBuild();
        await vi.waitFor(() => expect(gen.stage).toBe("done"));

        // the failing beat was tried twice, and neither try stopped the ones after it
        expect(seen).toEqual(["s1", "s2", "s2", "s3"]);
        expect(gen.content.sections.map((s) => s.id)).toEqual(["s1", "s3"]);
        expect(gen.slots.find((s) => s.id === "s2")?.status).toBe("failed");
        expect(gen.error).toBe(""); // no modal: the board says it, the run finishes
    });

    it("still writes the failed beat when its own card asks, which the error stage used to block", async () => {
        let landing = false;
        streamTurn.mockImplementation(async (req: TurnRequest, onEvent: (e: TurnEvent) => void) => {
            if (req.kind !== "build") {
                PLAN.forEach(onEvent);
                return;
            }
            const id = req.input.beat.id;
            const script = id === "s2" && !landing ? empty(id) : written(id, "s1");
            script.forEach(onEvent);
        });

        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        startBuild();
        await vi.waitFor(() => expect(gen.stage).toBe("done"));
        expect(gen.slots.find((s) => s.id === "s2")?.status).toBe("failed");

        landing = true;
        await buildSectionNow("s2");
        expect(gen.slots.find((s) => s.id === "s2")?.versions).toHaveLength(1);
        expect(gen.content.sections.map((s) => s.id)).toContain("s2");
    });

    it("lands the whole piece when the retry catches", async () => {
        let firstTry = true;
        streamTurn.mockImplementation(async (req: TurnRequest, onEvent: (e: TurnEvent) => void) => {
            if (req.kind !== "build") {
                PLAN.forEach(onEvent);
                return;
            }
            const id = req.input.beat.id;
            if (id === "s2" && firstTry) {
                firstTry = false;
                empty(id).forEach(onEvent);
                return;
            }
            written(id, id === "s1" ? null : "s1").forEach(onEvent);
        });

        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        startBuild();
        await vi.waitFor(() => expect(gen.stage).toBe("done"));

        expect(gen.content.sections).toHaveLength(3);
        expect(gen.slots.every((s) => s.status !== "failed")).toBe(true);
    });
});
