import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, sendShareInvite, sendWorkspaceInvite } from "@services/core/mail";

// The configured path: the Resend HTTP boundary is the one legitimate fake here, so the payload the
// real builders produce (subject, escaped html, from/to) is what gets asserted.

interface Sent {
    url: string;
    auth: string | null;
    body: Record<string, unknown>;
}

const arm = (status = 200): Sent[] => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        sent.push({
            url: String(input),
            auth: headers.get("authorization"),
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return Promise.resolve(
            new Response(status >= 400 ? "detail from resend" : "ok", { status }),
        );
    });
    return sent;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("sendEmail", () => {
    it("posts the full message to Resend under the configured key", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        const sent = arm();
        await sendEmail({ to: "a@b.co", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

        expect(sent).toHaveLength(1);
        expect(sent[0]!.url).toBe("https://api.resend.com/emails");
        expect(sent[0]!.auth).toBe("Bearer re_test");
        expect(sent[0]!.body.to).toBe("a@b.co");
        expect(sent[0]!.body.subject).toBe("Hi");
        expect(sent[0]!.body.html).toBe("<p>Hi</p>");
        expect(sent[0]!.body.text).toBe("Hi");
        expect(typeof sent[0]!.body.from).toBe("string");
    });

    it("throws with the status and the provider's detail on failure", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        arm(422);
        await expect(
            sendEmail({ to: "a@b.co", subject: "Hi", html: "x", text: "x" }),
        ).rejects.toThrow("email send failed (422): detail from resend");
    });
});

describe("sendShareInvite", () => {
    const invite = {
        to: "guest@example.com",
        artifactTitle: 'Q3 <b>"Plan"</b> & more',
        workspaceName: "Acme",
        inviterName: "Ada",
        url: "https://galleo.app/p/tok?k=1&b=2",
        message: "<img src=x> take a look",
    };

    it("escapes user-controlled text in the html but not in the subject", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        const sent = arm();
        expect(await sendShareInvite(invite)).toBe(true);

        const { subject, html } = sent[0]!.body as { subject: string; html: string };
        expect(subject).toBe('Ada shared “Q3 <b>"Plan"</b> & more” with you');
        expect(html).toContain("Q3 &lt;b&gt;&quot;Plan&quot;&lt;/b&gt; &amp; more");
        expect(html).not.toContain("<b>");
        expect(html).toContain("&lt;img src=x&gt; take a look");
        expect(html).not.toContain("<img");
        // the raw url drives the button; the visible fallback copy is escaped
        expect(html).toContain('href="https://galleo.app/p/tok?k=1&b=2"');
        expect(html).toContain("https://galleo.app/p/tok?k=1&amp;b=2");
    });

    it("omits the note block when there is no message", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        const sent = arm();
        await sendShareInvite({ ...invite, message: null });
        expect((sent[0]!.body as { html: string }).html).not.toContain("take a look");
    });

    it("reports false on a rejected send and on a network failure, never throwing", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        arm(500);
        expect(await sendShareInvite(invite)).toBe(false);

        vi.stubGlobal("fetch", (): Promise<Response> => Promise.reject(new Error("net down")));
        expect(await sendShareInvite(invite)).toBe(false);
    });
});

describe("sendWorkspaceInvite", () => {
    it("credits the inviter in the subject and escapes the workspace name in the html", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test");
        const sent = arm();
        const ok = await sendWorkspaceInvite({
            to: "new@example.com",
            workspaceName: "R&D <Lab>",
            inviterName: "Ada",
            url: "https://galleo.app/join/abc",
        });
        expect(ok).toBe(true);

        const { subject, html } = sent[0]!.body as { subject: string; html: string };
        expect(subject).toBe("Ada invited you to the R&D <Lab> workspace");
        expect(html).toContain("R&amp;D &lt;Lab&gt;");
        expect(html).toContain('href="https://galleo.app/join/abc"');
    });
});
