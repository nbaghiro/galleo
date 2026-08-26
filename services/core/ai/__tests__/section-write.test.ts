import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import type { Section } from "@model/artifact";
import { drain, makeContext } from "@services/core/ai/tools";
import { writeSectionTool } from "@services/core/ai/tools/plan";

// The one seam is the model call: what runs under it is the real writeSectionTool, so this proves
// the retry the build depends on rather than restating it.
vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateText: vi.fn() };
});

beforeAll(() => vi.stubEnv("GALLEO_FAKE_AI", "1"));
afterAll(() => vi.unstubAllEnvs());

const GOOD = JSON.stringify({
    id: "s1",
    root: {
        type: "container",
        data: {
            children: [
                { type: "text", data: { text: "The road to opening", style: "h1" } },
                {
                    type: "text",
                    data: {
                        text: "Three neighbourhood sites, one lease signed, and a kitchen fit-out that starts in March. Everything below follows from that timing.",
                        style: "body",
                    },
                },
            ],
        },
    },
});

const text = (t: string): Awaited<ReturnType<typeof generateText>> =>
    ({ text: t }) as Awaited<ReturnType<typeof generateText>>;

// the same door runBuild uses, so the tool is reached the way the pipeline reaches it
const write = (signal?: AbortSignal): Promise<Section> =>
    drain(
        makeContext({ image: {}, signal }).use(writeSectionTool, {
            parts: { system: "s", prompt: "p" },
            id: "s1",
            label: "The road",
            surface: "deck",
        }),
    );

describe("writeSectionTool survives a provider that hiccups", () => {
    beforeEach(() => vi.mocked(generateText).mockReset());

    it("spends an attempt on a thrown call rather than losing the section", async () => {
        vi.mocked(generateText)
            .mockRejectedValueOnce(new Error("overloaded_error"))
            .mockResolvedValueOnce(text(GOOD));

        const section = await write();
        expect(section.id).toBe("s1");
        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    });

    it("gives up only once every attempt is gone, and says what the provider said", async () => {
        const boom = (): Promise<never> => Promise.reject(new Error("overloaded_error"));
        vi.mocked(generateText)
            .mockImplementationOnce(boom)
            .mockImplementationOnce(boom)
            .mockImplementationOnce(boom);

        await expect(write()).rejects.toThrow("overloaded_error");
        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(3);
    });

    it("keeps a section that parsed but never passed the checks, over none at all", async () => {
        // an empty frame fails checkSection every time, so the loop runs out with it in hand
        const thin = JSON.stringify({
            id: "s1",
            root: { type: "container", data: { children: [] } },
        });
        vi.mocked(generateText).mockResolvedValue(text(thin));

        const section = await write();
        expect(section.id).toBe("s1");
        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(3);
    });

    it("lets a cancel through at once rather than retrying into an aborted signal", async () => {
        const controller = new AbortController();
        controller.abort();
        vi.mocked(generateText).mockImplementationOnce(() => Promise.reject(new Error("aborted")));

        await expect(write(controller.signal)).rejects.toThrow("aborted");
        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    });
});
