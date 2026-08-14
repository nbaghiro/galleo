// Voice dictation: the server's only job is minting a single-use ElevenLabs token so the
// browser can stream microphone audio directly to the provider — audio never transits Galleo.

export class VoiceError extends Error {
    constructor(
        message: string,
        readonly status: 502 | 503,
    ) {
        super(message);
    }
}

const TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";
const WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

// session params live here so the provider contract has exactly one home; vad commits firm the
// transcript up during natural pauses, the client sends a final manual commit on release
const SESSION = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: "pcm_16000",
    commit_strategy: "vad",
});

export function voiceReady(): boolean {
    return !!process.env.ELEVENLABS_API_KEY;
}

/** Mint a single-use token (15-minute TTL, consumed on connect) and the socket URL to use it on. */
export async function mintVoiceToken(fetchFn: typeof fetch = fetch): Promise<{ url: string }> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new VoiceError("voice input is not configured on this server", 503);
    let res: Response;
    try {
        res = await fetchFn(TOKEN_URL, { method: "POST", headers: { "xi-api-key": key } });
    } catch {
        throw new VoiceError("the transcription service could not be reached", 502);
    }
    if (!res.ok) throw new VoiceError(`the transcription service refused (${res.status})`, 502);
    const { token } = (await res.json()) as { token?: string };
    if (!token) throw new VoiceError("the transcription service returned no token", 502);
    return { url: `${WS_URL}?${SESSION}&token=${encodeURIComponent(token)}` };
}
