// Transactional email — a provider-agnostic sender. The provider today is Resend (one REST call, no SDK
// dependency); to swap vendors, change only `deliver()`. Env-driven and lazy like billing: a missing
// RESEND_API_KEY doesn't crash boot — `deliver()` resolves to `false` (a silent no-op) so dev works
// without email configured. Callers surface the copyable per-recipient links regardless of delivery.

const FROM = process.env.MAIL_FROM ?? "Galleo <onboarding@resend.dev>";

// Email is live once an API key is present. (Callers still work when it isn't — invites just aren't sent.)
export function mailReady(): boolean {
    return !!process.env.RESEND_API_KEY;
}

interface Email {
    to: string;
    subject: string;
    html: string;
}

// The single vendor touch-point. Returns whether the message was accepted for delivery.
async function deliver(msg: Email): Promise<boolean> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return false; // unconfigured → skip silently (dev)
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: FROM, to: msg.to, subject: msg.subject, html: msg.html }),
        });
        return res.ok;
    } catch {
        return false; // network/provider error — never let a send failure break the publish flow
    }
}

const escapeHtml = (s: string): string =>
    s.replace(
        /[&<>"']/g,
        (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
    );

export interface ShareInvite {
    to: string;
    artifactTitle: string;
    workspaceName: string;
    inviterName?: string | null;
    url: string;
    message?: string | null;
}

// A private-share invitation carrying the recipient's own tokenized link. Returns whether it was sent.
export async function sendShareInvite(invite: ShareInvite): Promise<boolean> {
    const title = escapeHtml(invite.artifactTitle);
    const who = escapeHtml(invite.inviterName || invite.workspaceName);
    const subject = `${who} shared “${invite.artifactTitle}” with you`;
    const note = invite.message
        ? `<p style="margin:0 0 20px;padding:14px 16px;background:#f4f4f5;border-radius:10px;color:#3f3f46;font-size:14px;line-height:1.5">${escapeHtml(
              invite.message,
          )}</p>`
        : "";
    const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 8px;font-size:13px;color:#71717a">${who} shared a document with you</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.3">${title}</h1>
    ${note}
    <a href="${invite.url}" style="display:inline-block;padding:11px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600">Open document</a>
    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5">This link is unique to you — please don't forward it. If the button doesn't work, paste this URL into your browser:<br><span style="color:#71717a;word-break:break-all">${escapeHtml(
        invite.url,
    )}</span></p>
    <p style="margin:28px 0 0;font-size:11px;color:#d4d4d8">Sent via Galleo</p>
  </div>
</body></html>`;
    return deliver({ to: invite.to, subject, html });
}
