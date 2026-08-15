import { describe, expect, it } from "vitest";
import {
    fetchWebpage,
    htmlToText,
    isPrivateAddress,
    type WebpageDeps,
} from "@services/utils/webpage";

describe("isPrivateAddress", () => {
    it("rejects the private v4 ranges", () => {
        for (const ip of [
            "0.0.0.0",
            "10.1.2.3",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
        ]) {
            expect(isPrivateAddress(ip), ip).toBe(true);
        }
    });

    it("allows public v4", () => {
        for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "192.169.0.1"]) {
            expect(isPrivateAddress(ip), ip).toBe(false);
        }
    });

    it("rejects loopback, ULA, and link-local v6", () => {
        for (const ip of ["::1", "::", "fc00::1", "fd12::1", "fe80::1"]) {
            expect(isPrivateAddress(ip), ip).toBe(true);
        }
    });

    it("catches a v4-mapped v6 smuggling a private address", () => {
        expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
        expect(isPrivateAddress("::ffff:1.1.1.1")).toBe(false);
    });

    it("treats non-IPs as unsafe", () => {
        expect(isPrivateAddress("localhost")).toBe(true);
        expect(isPrivateAddress("")).toBe(true);
    });
});

describe("htmlToText", () => {
    it("pulls the title and strips markup", () => {
        const { title, text } = htmlToText(
            "<html><head><title> Hello </title><style>b{color:red}</style></head>" +
                "<body><h1>Hi</h1><p>One &amp; two.</p><script>alert(1)</script></body></html>",
        );
        expect(title).toBe("Hello");
        expect(text).toContain("Hi");
        expect(text).toContain("One & two.");
        expect(text).not.toContain("alert");
        expect(text).not.toContain("color:red");
    });

    it("turns block-level closes into line breaks", () => {
        const { text } = htmlToText("<p>first</p><p>second</p><li>third</li>");
        expect(text.split("\n").map((l) => l.trim())).toEqual(["first", "second", "third"]);
    });

    it("decodes the common entities", () => {
        const { text } = htmlToText("<p>&lt;a&gt;&nbsp;&quot;b&quot;&nbsp;&#39;c&#039;</p>");
        expect(text).toBe("<a> \"b\" 'c'");
    });

    it("decodes numeric entities, hex and decimal, without double-decoding", () => {
        const { text } = htmlToText("<p>caf&#233; &#x2014; &#x27;quoted&#x27; &amp;#39;</p>");
        // "&amp;#39;" is an escaped literal — it must surface as "&#39;", not an apostrophe
        expect(text).toBe("café — 'quoted' &#39;");
    });

    it("shrugs off an out-of-range code point", () => {
        expect(htmlToText("<p>a&#x110000;b</p>").text).toBe("a b");
    });
});

const publicLookup: NonNullable<WebpageDeps["lookupImpl"]> = () =>
    Promise.resolve([{ address: "93.184.216.34" }]);
const page = (body: string, init: ResponseInit = {}): Response =>
    new Response(body, { headers: { "content-type": "text/html" }, ...init });

describe("fetchWebpage", () => {
    it("fetches, extracts, and reports the final URL", async () => {
        const out = await fetchWebpage("https://example.com/a", {
            lookupImpl: publicLookup,
            fetchImpl: () => Promise.resolve(page("<title>T</title><p>real text</p>")),
        });
        expect(out).toMatchObject({ title: "T", finalUrl: "https://example.com/a" });
        expect(out.text).toContain("real text");
    });

    it("rejects a non-http scheme and a garbage URL", async () => {
        await expect(
            fetchWebpage("file:///etc/passwd", { lookupImpl: publicLookup }),
        ).rejects.toThrow(/http/);
        await expect(fetchWebpage("not a url", { lookupImpl: publicLookup })).rejects.toThrow(
            /URL/,
        );
    });

    it("rejects a host that resolves to private space", async () => {
        await expect(
            fetchWebpage("https://internal.test/", {
                lookupImpl: () => Promise.resolve([{ address: "10.0.0.5" }]),
            }),
        ).rejects.toThrow(/isn't reachable/);
    });

    it("rejects a literal private IP without a lookup", async () => {
        await expect(
            fetchWebpage("http://169.254.169.254/latest/meta-data", {
                lookupImpl: () => Promise.reject(new Error("must not be called")),
            }),
        ).rejects.toThrow(/isn't reachable/);
    });

    it("re-vets every redirect hop", async () => {
        const seen: string[] = [];
        await expect(
            fetchWebpage("https://example.com/", {
                lookupImpl: (host) => {
                    seen.push(host);
                    return Promise.resolve([
                        { address: host === "evil.test" ? "127.0.0.1" : "93.184.216.34" },
                    ]);
                },
                fetchImpl: () =>
                    Promise.resolve(
                        page("", { status: 302, headers: { location: "https://evil.test/" } }),
                    ),
            }),
        ).rejects.toThrow(/isn't reachable/);
        expect(seen).toEqual(["example.com", "evil.test"]);
    });

    it("gives up after too many redirects", async () => {
        await expect(
            fetchWebpage("https://example.com/", {
                lookupImpl: publicLookup,
                fetchImpl: (input) =>
                    Promise.resolve(
                        page("", { status: 301, headers: { location: `${String(input)}x` } }),
                    ),
            }),
        ).rejects.toThrow(/redirects/);
    });

    it("rejects a non-text content type", async () => {
        await expect(
            fetchWebpage("https://example.com/img", {
                lookupImpl: publicLookup,
                fetchImpl: () =>
                    Promise.resolve(
                        new Response("GIF89a", { headers: { "content-type": "image/gif" } }),
                    ),
            }),
        ).rejects.toThrow(/text page/);
    });

    it("reads plain text as-is", async () => {
        const out = await fetchWebpage("https://example.com/readme", {
            lookupImpl: publicLookup,
            fetchImpl: () =>
                Promise.resolve(
                    new Response("# plain notes", { headers: { "content-type": "text/plain" } }),
                ),
        });
        expect(out.text).toBe("# plain notes");
        expect(out.title).toBe("example.com");
    });

    it("caps a huge body instead of buffering it all", async () => {
        const out = await fetchWebpage("https://example.com/big", {
            lookupImpl: publicLookup,
            fetchImpl: () =>
                Promise.resolve(
                    new Response("x".repeat(3_000_000), {
                        headers: { "content-type": "text/plain" },
                    }),
                ),
        });
        expect(out.text.length).toBeLessThanOrEqual(2_000_000);
    });
});
