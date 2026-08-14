import { describe, expect, it } from "vitest";
import {
    base64Pcm,
    downsampleTo16k,
    emptyTranscript,
    insertDictation,
    reduceTranscript,
    transcriptText,
    TARGET_RATE,
} from "../voice";

describe("reduceTranscript", () => {
    it("tracks the live partial, then folds commits and clears it", () => {
        let s = emptyTranscript();
        s = reduceTranscript(s, { message_type: "partial_transcript", text: "hello wor" });
        expect(s).toEqual({ committed: [], partial: "hello wor" });
        s = reduceTranscript(s, { message_type: "partial_transcript", text: "hello world" });
        s = reduceTranscript(s, { message_type: "committed_transcript", text: "Hello world." });
        expect(s).toEqual({ committed: ["Hello world."], partial: "" });
        s = reduceTranscript(s, { message_type: "partial_transcript", text: "and then" });
        expect(transcriptText(s)).toBe("Hello world. and then");
    });

    it("ignores unrelated messages and empty commits", () => {
        const s = reduceTranscript(emptyTranscript(), { message_type: "session_started" });
        expect(s).toEqual(emptyTranscript());
        const t = reduceTranscript(
            { committed: ["a"], partial: "b" },
            { message_type: "committed_transcript", text: "" },
        );
        expect(t).toEqual({ committed: ["a"], partial: "" });
    });

    it("treats timestamped commits like plain ones", () => {
        const s = reduceTranscript(emptyTranscript(), {
            message_type: "committed_transcript_with_timestamps",
            text: "Done.",
        });
        expect(s.committed).toEqual(["Done."]);
    });
});

describe("insertDictation", () => {
    it("adds the missing space boundaries around the caret", () => {
        expect(insertDictation("make a deck", 11, "about whales")).toEqual({
            value: "make a deck about whales",
            caret: 24,
        });
        expect(insertDictation("start end", 5, "middle")).toEqual({
            value: "start middle end",
            caret: 12,
        });
    });

    it("does not double spaces that already exist", () => {
        expect(insertDictation("draft ", 6, "more").value).toBe("draft more");
        expect(insertDictation(" tail", 0, "head").value).toBe("head tail");
    });

    it("is a no-op for silence and inserts cleanly into an empty draft", () => {
        expect(insertDictation("keep", 4, "   ")).toEqual({ value: "keep", caret: 4 });
        expect(insertDictation("", 0, " spoken words ")).toEqual({
            value: "spoken words",
            caret: 12,
        });
    });
});

describe("downsampleTo16k", () => {
    it("halves a 32k signal and clamps to int16 range", () => {
        const input = new Float32Array([0, 1, 0, -1, 0, 1, 0, -1]);
        const out = downsampleTo16k(input, 32000);
        expect(out.length).toBe(4);
        expect(Math.max(...out)).toBeLessThanOrEqual(32767);
        expect(Math.min(...out)).toBeGreaterThanOrEqual(-32768);
    });

    it("keeps a 16k signal as-is, sample for sample", () => {
        const input = new Float32Array([0.5, -0.5, 0.25]);
        const out = downsampleTo16k(input, TARGET_RATE);
        expect(Array.from(out)).toEqual([16384, -16383, 8192]);
    });

    it("interpolates rather than skipping when decimating 48k", () => {
        // a pure ramp stays a ramp after linear-interp decimation
        const input = new Float32Array(48);
        for (let i = 0; i < 48; i++) input[i] = i / 48;
        const out = downsampleTo16k(input, 48000);
        expect(out.length).toBe(16);
        for (let i = 1; i < out.length; i++) {
            const a = out[i] ?? 0;
            const b = out[i - 1] ?? 0;
            expect(a).toBeGreaterThan(b);
        }
    });
});

describe("base64Pcm", () => {
    it("round-trips little-endian int16 bytes", () => {
        const encoded = base64Pcm(new Int16Array([1, -2, 256]));
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const back = new Int16Array(bytes.buffer);
        expect(Array.from(back)).toEqual([1, -2, 256]);
    });
});
