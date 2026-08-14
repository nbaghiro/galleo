// Hold-to-talk dictation: capture mic audio, downsample to 16k PCM in an AudioWorklet graph,
// stream it over a direct WebSocket to the transcription provider (the server only mints the
// single-use socket url), and reduce partial/committed events into live transcript state.
import { api } from "../api";

export const TARGET_RATE = 16000;
const BATCH_MS = 100;
const MAX_SESSION_MS = 120_000;
// release → how long we wait for the provider to finalize before taking what we have
const COMMIT_WAIT_MS = 1800;

export type VoiceStatus = "permission" | "connecting" | "listening" | "finishing";

export interface TranscriptState {
    committed: string[];
    partial: string;
}

export const emptyTranscript = (): TranscriptState => ({ committed: [], partial: "" });

type ServerMsg = { message_type?: string; text?: string; error?: string };

export function reduceTranscript(state: TranscriptState, msg: ServerMsg): TranscriptState {
    const text = msg.text ?? "";
    if (msg.message_type === "partial_transcript") return { ...state, partial: text };
    if (
        msg.message_type === "committed_transcript" ||
        msg.message_type === "committed_transcript_with_timestamps"
    )
        return { committed: text ? [...state.committed, text] : state.committed, partial: "" };
    return state;
}

export function transcriptText(state: TranscriptState): string {
    return [...state.committed, state.partial].filter(Boolean).join(" ").trim();
}

/** Splice dictated text into a draft at the caret, keeping single-space boundaries. */
export function insertDictation(
    draft: string,
    caret: number,
    text: string,
): { value: string; caret: number } {
    const spoken = text.trim();
    if (!spoken) return { value: draft, caret };
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const tail = after && !/^\s/.test(after) ? " " : "";
    const value = before + lead + spoken + tail + after;
    return { value, caret: (before + lead + spoken).length };
}

export function downsampleTo16k(input: Float32Array, inRate: number): Int16Array {
    const ratio = inRate / TARGET_RATE;
    const outLen = ratio > 1 ? Math.floor(input.length / ratio) : input.length;
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        const a = input[i0] ?? 0;
        const b = input[i0 + 1] ?? a;
        const sample = a * (1 - frac) + b * frac;
        out[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    return out;
}

export function base64Pcm(samples: Int16Array): string {
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

export const voiceSupported = (): boolean =>
    !!navigator.mediaDevices?.getUserMedia && "AudioWorklet" in window;

// tiny forwarder: the worklet thread just ships raw 128-frame blocks to the main thread,
// which batches + downsamples (keeps the resample math unit-testable)
const WORKLET = `class P extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) this.port.postMessage(ch.slice(0));
        return true;
    }
}
registerProcessor("galleo-capture", P);`;
let workletUrl: string | undefined;

const micErrorMessage = (e: unknown): string => {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
        return "Microphone access is blocked — allow it in your browser settings.";
    if (name === "NotFoundError") return "No microphone was found.";
    return "The microphone could not be started.";
};

export interface VoiceSession {
    /** Release: flush, ask the provider to finalize, then hand the text to onDone. */
    stop(): void;
    /** Abandon: tear everything down, nothing is inserted. */
    cancel(): void;
}

export function startVoiceSession(opts: {
    previousText?: string;
    onStatus: (s: VoiceStatus) => void;
    onTranscript: (t: TranscriptState) => void;
    onError: (message: string) => void;
    onDone: (text: string) => void;
}): VoiceSession {
    // created synchronously inside the press gesture — iOS refuses a context started later
    const ctx = new AudioContext();
    void ctx.resume();

    let transcript = emptyTranscript();
    let ws: WebSocket | undefined;
    let stream: MediaStream | undefined;
    let ended = false;
    let sessionReady = false;
    let stopping = false;
    let sentFirst = false;
    let commitTimer: ReturnType<typeof setTimeout> | undefined;
    const queued: string[] = [];
    const buffers: Float32Array[] = [];
    let buffered = 0;

    const teardown = (): void => {
        ended = true;
        clearTimeout(maxTimer);
        clearTimeout(commitTimer);
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("pagehide", finish);
        stream?.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
        try {
            ws?.close();
        } catch {
            // already closed
        }
    };

    const fail = (message: string): void => {
        if (ended) return;
        teardown();
        opts.onError(message);
    };

    const finish = (): void => {
        if (ended) return;
        teardown();
        opts.onDone(transcriptText(transcript));
    };

    // screen lock / tab switch / navigation mid-hold: keep what was already transcribed
    const onHidden = (): void => {
        if (document.visibilityState === "hidden") finish();
    };

    const send = (payload: string): void => {
        if (ws?.readyState === WebSocket.OPEN && sessionReady) ws.send(payload);
        else if (queued.length < 100) queued.push(payload);
    };

    const chunkMsg = (samples: Int16Array, commit: boolean): string => {
        const msg: Record<string, unknown> = {
            message_type: "input_audio_chunk",
            audio_base_64: base64Pcm(samples),
            sample_rate: TARGET_RATE,
            commit,
        };
        if (!sentFirst) {
            sentFirst = true;
            if (opts.previousText) msg.previous_text = opts.previousText;
        }
        return JSON.stringify(msg);
    };

    const flushAudio = (commit: boolean): void => {
        if (!buffered && !commit) return;
        const all = new Float32Array(buffered);
        let at = 0;
        for (const b of buffers) {
            all.set(b, at);
            at += b.length;
        }
        buffers.length = 0;
        buffered = 0;
        send(chunkMsg(downsampleTo16k(all, ctx.sampleRate), commit));
    };

    const requestCommit = (): void => {
        opts.onStatus("finishing");
        flushAudio(true);
        // the vad may already have committed everything; the timer bounds the wait either way
        commitTimer = setTimeout(finish, COMMIT_WAIT_MS);
    };

    const stop = (): void => {
        if (ended || stopping) return;
        stopping = true;
        // not connected yet: give the session a moment to open so short holds still transcribe
        if (!sessionReady) commitTimer = setTimeout(finish, COMMIT_WAIT_MS);
        else requestCommit();
    };

    const maxTimer = setTimeout(stop, MAX_SESSION_MS);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", finish);

    opts.onStatus("permission");
    const socketP = api.voiceToken();
    const micP = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    void (async () => {
        try {
            stream = await micP;
        } catch (e) {
            fail(micErrorMessage(e));
            return;
        }
        if (ended) {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }
        opts.onStatus("connecting");

        let url: string;
        try {
            url = (await socketP).url;
        } catch (e) {
            fail(e instanceof Error ? e.message : "Voice input is unavailable right now.");
            return;
        }
        if (ended) return;

        try {
            workletUrl ??= URL.createObjectURL(
                new Blob([WORKLET], { type: "application/javascript" }),
            );
            await ctx.audioWorklet.addModule(workletUrl);
        } catch {
            fail("Audio capture could not be set up in this browser.");
            return;
        }
        if (ended) return;

        const node = new AudioWorkletNode(ctx, "galleo-capture");
        node.port.onmessage = (e: MessageEvent<Float32Array>) => {
            buffers.push(e.data);
            buffered += e.data.length;
            if (buffered >= (ctx.sampleRate * BATCH_MS) / 1000 && !stopping) flushAudio(false);
        };
        const silent = ctx.createGain();
        silent.gain.value = 0;
        ctx.createMediaStreamSource(stream).connect(node);
        node.connect(silent).connect(ctx.destination);

        ws = new WebSocket(url);
        ws.onmessage = (e: MessageEvent<string>) => {
            let msg: ServerMsg;
            try {
                msg = JSON.parse(e.data) as ServerMsg;
            } catch {
                return;
            }
            if (msg.message_type === "session_started") {
                sessionReady = true;
                if (!stopping) opts.onStatus("listening");
                for (const p of queued) ws?.send(p);
                queued.length = 0;
                if (stopping) requestCommit();
                return;
            }
            if (msg.message_type === "commit_throttled") {
                // the release commit found <0.3s of uncommitted audio — the vad already
                // committed everything, so the transcript we hold is complete
                if (stopping) finish();
                return;
            }
            const next = reduceTranscript(transcript, msg);
            if (next !== transcript) {
                transcript = next;
                opts.onTranscript(transcript);
                // release already asked for the final commit — first one to land completes it
                if (stopping && !transcript.partial && msg.message_type?.startsWith("committed"))
                    finish();
                return;
            }
            if (msg.error || msg.message_type?.includes("error"))
                fail(
                    typeof msg.error === "string" && msg.error
                        ? `Transcription failed: ${msg.error}`
                        : "The transcription service rejected the session.",
                );
        };
        ws.onerror = () => fail("The transcription connection failed.");
        ws.onclose = () => {
            if (!ended && !stopping) fail("The transcription connection dropped.");
            else if (!ended) finish();
        };
    })();

    return {
        stop,
        cancel: () => {
            if (!ended) teardown();
        },
    };
}
