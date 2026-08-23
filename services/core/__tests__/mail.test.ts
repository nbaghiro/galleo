import { afterEach, describe, expect, it, vi } from "vitest";
import { mailReady, sendEmail, sendShareInvite } from "@services/core/mail";
import type { ShareInvite } from "@services/core/mail";

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
