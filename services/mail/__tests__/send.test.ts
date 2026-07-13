import { afterEach, describe, expect, it, vi } from "vitest";
import { mailReady, sendShareInvite } from "../send";
import type { ShareInvite } from "../send";

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
