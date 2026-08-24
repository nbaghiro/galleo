import { afterEach, describe, expect, it, vi } from "vitest";
import { mailReady, sendEmail, sendShareInvite } from "@services/core/mail";
import type { ShareInvite } from "@services/core/mail";

type MxAnswer = Promise<{ exchange: string; priority: number }[]> | Error;
const dnsError = (code: string): Error => Object.assign(new Error(code), { code });

const invite = (over: Partial<ShareInvite> = {}): ShareInvite => ({
    to: "guest@example.com",
    artifactTitle: "Q3 Roadmap <script>",
    workspaceName: "Acme",
    inviterName: "Ada",
    url: "https://galleo.app/s/tok?a=1&b=2",
    message: "take a look",
    ...over,
});

describe("mailReady", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is true once RESEND_API_KEY is present", () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        expect(mailReady()).toBe(true);
    });

    it("is false when RESEND_API_KEY is unset", () => {
        vi.stubEnv("RESEND_API_KEY", undefined);
        expect(mailReady()).toBe(false);
    });

    it("treats an empty RESEND_API_KEY as not configured", () => {
        vi.stubEnv("RESEND_API_KEY", "");
        expect(mailReady()).toBe(false);
    });
});

describe("sendShareInvite", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("resolves to false (silent no-op) when email is unconfigured — no network call", async () => {
        vi.stubEnv("RESEND_API_KEY", undefined);
        await expect(sendShareInvite(invite())).resolves.toBe(false);
    });

    it("short-circuits without a key even when optional fields are omitted", async () => {
        vi.stubEnv("RESEND_API_KEY", undefined);
        await expect(sendShareInvite(invite({ inviterName: null, message: null }))).resolves.toBe(
            false,
        );
    });
});

// The sender is a constant because DMARC on galleo.app is strict-aligned: the Resend key signs
// d=galleo.app, so an apex From is the only one that passes. A subdomain sender would be rejected,
// and the old resend.dev default 403'd for every recipient but the account owner.
describe("the sender", () => {
    const body = async (): Promise<Record<string, unknown>> => {
        const calls: string[] = [];
        vi.stubGlobal("fetch", (_u: string, init: { body: string }) => {
            calls.push(init.body);
            return Promise.resolve(new Response("{}", { status: 200 }));
        });
        vi.stubEnv("RESEND_API_KEY", "test-key");
        await sendEmail({ to: "a@b.co", subject: "s", html: "<p>h</p>", text: "t" });
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        return JSON.parse(calls[0]!) as Record<string, unknown>;
    };

    it("sends from the apex, never the relay subdomain or the resend sandbox", async () => {
        const from = String((await body()).from);
        expect(from).toContain("@galleo.app");
        expect(from).not.toContain("send.galleo.app");
        expect(from).not.toContain("resend.dev");
    });

    it("points replies at somewhere a person reads", async () => {
        expect((await body()).reply_to).toBe("support@galleo.app");
    });
});

// The MX check, with the resolver mocked: what matters is which answers are treated as "this domain
// takes no mail" and which are treated as our own problem, not what DNS says today.
describe("domainAcceptsMail", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.doUnmock("node:dns/promises");
    });

    const withMx = async (answer: MxAnswer, email: string, key = "re_test"): Promise<boolean> => {
        vi.resetModules();
        vi.doMock("node:dns/promises", () => ({
            resolveMx: () => (answer instanceof Error ? Promise.reject(answer) : answer),
        }));
        vi.stubEnv("RESEND_API_KEY", key);
        const mod = await import("@services/core/mail");
        return mod.domainAcceptsMail(email);
    };

    it("accepts a domain with a real exchange", async () => {
        expect(
            await withMx(
                Promise.resolve([{ exchange: "aspmx.l.google.com", priority: 10 }]),
                "a@fresh1.test",
            ),
        ).toBe(true);
    });

    it("refuses a domain whose only MX is the RFC 7505 null one", async () => {
        expect(
            await withMx(Promise.resolve([{ exchange: ".", priority: 0 }]), "a@fresh2.test"),
        ).toBe(false);
    });

    it("refuses a domain that does not exist, and one with no MX at all", async () => {
        expect(await withMx(dnsError("ENOTFOUND"), "a@fresh3.test")).toBe(false);
        expect(await withMx(dnsError("ENODATA"), "a@fresh4.test")).toBe(false);
        expect(await withMx(Promise.resolve([]), "a@fresh5.test")).toBe(false);
    });

    // a resolver failure is an outage on our side, and a signup refused for one is worse than a code
    // that may not arrive
    it("fails open on a resolver error that is not an answer", async () => {
        expect(await withMx(dnsError("ESERVFAIL"), "a@fresh6.test")).toBe(true);
        expect(await withMx(dnsError("ETIMEOUT"), "a@fresh7.test")).toBe(true);
    });

    // refusing an address as undeliverable while sending nothing would be incoherent, and it keeps
    // DNS out of every test that signs someone up
    it("skips the lookup entirely when there is no mailer", async () => {
        expect(await withMx(dnsError("ENOTFOUND"), "a@fresh8.test", "")).toBe(true);
    });

    it("refuses an address with no domain part", async () => {
        expect(await withMx(Promise.resolve([]), "no-at-sign")).toBe(false);
    });
});
