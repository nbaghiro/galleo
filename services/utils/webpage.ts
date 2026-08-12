import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetch a user-supplied URL as text, safely: this runs server-side against arbitrary input, so
// every hop is vetted against private address space before it is fetched. The residual TOCTOU
// between the DNS check and the fetch is accepted — the check is per hop, redirects are re-vetted,
// and nothing internal should trust unauthenticated HTTP anyway.

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export interface WebpageDeps {
    fetchImpl?: typeof fetch;
    lookupImpl?: (host: string) => Promise<{ address: string }[]>;
}

export interface Webpage {
    title: string;
    text: string;
    finalUrl: string;
}

const PRIVATE_V4 = [
    /^0\./,
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
];

export function isPrivateAddress(ip: string): boolean {
    const v = isIP(ip);
    if (v === 4) return PRIVATE_V4.some((r) => r.test(ip));
    if (v === 6) {
        const low = ip.toLowerCase();
        if (low === "::" || low === "::1") return true;
        if (low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe8")) return true;
        // v4-mapped v6 smuggles a v4 address past the v4 checks
        const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]!);
        return false;
    }
    return true; // not an IP at all — treat as unsafe
}

async function assertPublicHost(
    url: URL,
    lookupImpl: NonNullable<WebpageDeps["lookupImpl"]>,
): Promise<void> {
    const host = url.hostname;
    if (isIP(host)) {
        if (isPrivateAddress(host)) throw new Error("that address isn't reachable from here");
        return;
    }
    let addresses: { address: string }[];
    try {
        addresses = await lookupImpl(host);
    } catch {
        throw new Error(`couldn't resolve ${host}`);
    }
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
        throw new Error("that address isn't reachable from here");
}

const codePoint = (n: number): string => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ");

// tags whose content is noise, then block-level breaks, then everything else stripped
export function htmlToText(html: string): { title: string; text: string } {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    const text = html
        .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { title, text };
}

async function readCapped(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const parts: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        bytes += value.byteLength;
        if (bytes >= MAX_BYTES) {
            await reader.cancel();
            break;
        }
    }
    const joined = new Uint8Array(bytes > MAX_BYTES ? MAX_BYTES : bytes);
    let at = 0;
    for (const part of parts) {
        const take = Math.min(part.byteLength, joined.byteLength - at);
        joined.set(part.subarray(0, take), at);
        at += take;
        if (at >= joined.byteLength) break;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

export async function fetchWebpage(rawUrl: string, deps: WebpageDeps = {}): Promise<Webpage> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const lookupImpl = deps.lookupImpl ?? ((host: string) => lookup(host, { all: true }));

    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        throw new Error("that doesn't look like a URL");
    }

    for (let hop = 0; ; hop++) {
        if (url.protocol !== "http:" && url.protocol !== "https:")
            throw new Error("only http(s) links can be added");
        await assertPublicHost(url, lookupImpl);

        const res = await fetchImpl(url.href, {
            redirect: "manual",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "GalleoBot/1.0" },
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location || hop >= MAX_REDIRECTS)
                throw new Error("that link redirects somewhere it shouldn't");
            url = new URL(location, url);
            continue;
        }
        if (!res.ok) throw new Error(`that page answered ${res.status}`);

        const type = res.headers.get("content-type") ?? "";
        if (!/text\/html|text\/plain|application\/xhtml/.test(type))
            throw new Error("that link isn't a text page");

        const raw = await readCapped(res);
        const { title, text } = type.includes("plain")
            ? { title: "", text: raw.trim() }
            : htmlToText(raw);
        if (!text) throw new Error("that page had no readable text");
        return { title: title || url.hostname, text, finalUrl: url.href };
    }
}
