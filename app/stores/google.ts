import { api, ApiError } from "@app/api";

// The Google side of the Slides export: base64 the deck, POST it, and when the server answers 428
// (no live Drive grant) run the consent popup once and retry. The popup page posts
// {type:"galleo:google-connect", ok} back to this window and closes itself.

// chunked: one spread of a multi-MB deck overflows the argument list
export function toBase64(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

const CONNECT_TIMEOUT_MS = 180_000;

export function connectGoogle(): Promise<void> {
    return new Promise((resolve, reject) => {
        const popup = window.open(
            "/api/auth/google/connect",
            "galleo-google-connect",
            "popup,width=480,height=640",
        );
        if (!popup) {
            reject(new Error("The browser blocked the Google window. Allow popups and try again."));
            return;
        }
        let settled = false;
        const finish = (err?: Error): void => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMsg);
            clearInterval(watch);
            clearTimeout(timer);
            if (err) reject(err);
            else resolve();
        };
        const onMsg = (e: MessageEvent): void => {
            if (e.origin !== window.location.origin) return;
            const d = e.data as { type?: string; ok?: boolean } | null;
            if (!d || d.type !== "galleo:google-connect") return;
            finish(d.ok ? undefined : new Error("Google did not finish connecting. Try again."));
        };
        window.addEventListener("message", onMsg);
        // the popup posts before closing itself, so the message beats this poll when things worked
        const watch = setInterval(() => {
            if (popup.closed) finish(new Error("The Google window was closed before finishing."));
        }, 600);
        const timer = setTimeout(
            () => finish(new Error("Connecting to Google timed out.")),
            CONNECT_TIMEOUT_MS,
        );
    });
}

export async function sendToGoogleSlides(
    bytes: Uint8Array,
    name: string,
): Promise<{ url: string }> {
    const data = toBase64(bytes);
    try {
        return await api.googleSlides(data, name);
    } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 428) throw e;
        await connectGoogle();
        return api.googleSlides(data, name);
    }
}
