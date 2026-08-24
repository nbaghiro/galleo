import { resolveMx } from "node:dns/promises";
import type { ArtifactAccess } from "@model/artifact";
import { out, warn } from "@services/utils/env";

// Constants rather than config: there is one production domain, neither address is a secret, and the
// previous default (Resend's shared `onboarding@resend.dev`) only ever delivered to the Resend
// account owner, so an unset variable failed every real signup with a 403 nobody saw.
//
// The apex, not `send.galleo.app`, even though the relay lives on the subdomain. DMARC on galleo.app
// is `p=reject; adkim=s; aspf=s`: strict alignment, and Resend's Return-Path sits on the subdomain,
// so SPF can never align. DKIM has to carry it, the key is published at `resend._domainkey.galleo.app`
// and therefore signs `d=galleo.app`, which aligns only with an apex From.
const FROM = "Galleo <noreply@galleo.app>";

// Nothing receives on noreply@, so a person answering an invite needs somewhere real to land. A
// Workspace group rather than a mailbox: it costs no seat and can fan out.
const REPLY_TO = "support@galleo.app";

export function mailReady(): boolean {
    return !!process.env.RESEND_API_KEY;
}

// Said once at boot rather than per send. Without a key every message is written to the log instead,
// which is right in dev and silently loses verification mail in production.
export function checkMailConfig(): void {
    if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY)
        warn("RESEND_API_KEY is not set: no email will be delivered, including verification");
}

// Real validation, as opposed to the shape check the field does: an address whose domain accepts no
// mail cannot be confirmed, so refusing it at signup is more honest than mailing a code into a hole.
// It answers the domain question only; whether the mailbox exists is what the code is for.
//
// Only when there is a mailer. Refusing an address as undeliverable while we are not sending anything
// is incoherent, and it keeps DNS out of the test path, where every suite runs with the key blank.
//
// Fails OPEN on anything that is not a clear answer. A resolver timeout is an outage on our side, and
// a signup refused because DNS was slow is worse than one that proceeds to a code it may not receive.
const MX_TTL_MS = 6 * 60 * 60 * 1000;
const MX_TIMEOUT_MS = 2_500;
const mxCache = new Map<string, { ok: boolean; at: number }>();

export async function domainAcceptsMail(email: string): Promise<boolean> {
    if (!mailReady()) return true;
    const domain = email.split("@")[1]?.trim().toLowerCase();
    if (!domain) return false;
    const hit = mxCache.get(domain);
    if (hit && Date.now() - hit.at < MX_TTL_MS) return hit.ok;

    const timeout = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(true), MX_TIMEOUT_MS).unref(),
    );
    const ok = await Promise.race([lookupMx(domain), timeout]);
    mxCache.set(domain, { ok, at: Date.now() });
    return ok;
}

// An MX is required rather than preferred. RFC 5321 says a domain with only an address record still
// takes mail at that host, but in practice the domains that fit that description are parked ones, and
// they are most of what this is here to catch: `gmial.com` has an A record and no mail.
// A single "." exchange is RFC 7505's null MX, which is a domain saying outright that it takes none.
async function lookupMx(domain: string): Promise<boolean> {
    try {
        const mx = await resolveMx(domain);
        return mx.some((r) => {
            const host = r.exchange.trim().replace(/\.$/, "");
            return host !== "";
        });
    } catch (e) {
        // ENOTFOUND/NODATA is an answer: no MX, or no such domain. Anything else is our problem.
        const code = (e as NodeJS.ErrnoException).code;
        return code !== "ENOTFOUND" && code !== "ENODATA";
    }
}

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string; // defaults to the support group; pass one to route replies elsewhere
}

// Throws on failure (callers `.catch`); with no RESEND_API_KEY it logs so local flows stay testable.
export async function sendEmail(msg: EmailMessage): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
        out(
            `\n[email:dev] no RESEND_API_KEY, so this was not sent.\n  to      ${msg.to}\n  subject ${msg.subject}\n${msg.text.replace(/^/gm, "  ")}\n`,
        );
        return;
    }
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: FROM,
            reply_to: msg.replyTo ?? REPLY_TO,
            to: msg.to,
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`email send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
}

interface Email {
    to: string;
    subject: string;
    html: string;
}

// The invite paths, where a send failure must not break the flow that triggered it: false rather
// than a throw. One sender underneath, so there is a single place the From and the reply-to are set.
async function deliver(msg: Email): Promise<boolean> {
    if (!mailReady()) return false;
    try {
        await sendEmail({ ...msg, text: htmlToText(msg.html) });
        return true;
    } catch {
        return false;
    }
}

// Resend requires a text part, and an invite's body is written as HTML. Not a general converter: it
// unwraps the handful of tags these templates use so the plain-text alternative reads as sentences.
const htmlToText = (html: string): string =>
    html
        .replace(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, "$2: $1")
        .replace(/<\/(p|div|li|h1|h2|h3|tr)>/g, "\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

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
    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5">This link is unique to you. Please don't forward it. If the button doesn't work, paste this URL into your browser:<br><span style="color:#71717a;word-break:break-all">${escapeHtml(
        invite.url,
    )}</span></p>
    <p style="margin:28px 0 0;font-size:11px;color:#d4d4d8">Sent via Galleo</p>
  </div>
</body></html>`;
    return deliver({ to: invite.to, subject, html });
}

export interface CollabInvite {
    to: string;
    artifactTitle: string;
    workspaceName: string;
    inviterName?: string | null;
    access: ArtifactAccess;
    url: string;
}

const COLLAB_VERB: Record<ArtifactAccess, string> = {
    none: "opened",
    view: "read",
    comment: "read and comment on",
    edit: "edit",
};

export async function sendCollabInvite(invite: CollabInvite): Promise<boolean> {
    const title = escapeHtml(invite.artifactTitle);
    const who = escapeHtml(invite.inviterName || invite.workspaceName);
    const subject = `${who} invited you to ${COLLAB_VERB[invite.access]} “${invite.artifactTitle}”`;
    const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 8px;font-size:13px;color:#71717a">${who} invited you to ${COLLAB_VERB[invite.access]} a document</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.3">${title}</h1>
    <a href="${invite.url}" style="display:inline-block;padding:11px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600">Open document</a>
    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5">This link is unique to you. Please don't forward it. If the button doesn't work, paste this URL into your browser:<br><span style="color:#71717a;word-break:break-all">${escapeHtml(
        invite.url,
    )}</span></p>
    <p style="margin:28px 0 0;font-size:11px;color:#d4d4d8">Sent via Galleo</p>
  </div>
</body></html>`;
    return deliver({ to: invite.to, subject, html });
}

export interface WorkspaceInvite {
    to: string;
    workspaceName: string;
    inviterName?: string | null;
    url: string;
}

export async function sendWorkspaceInvite(invite: WorkspaceInvite): Promise<boolean> {
    const wsName = escapeHtml(invite.workspaceName);
    const who = escapeHtml(invite.inviterName || invite.workspaceName);
    const subject = `${who} invited you to the ${invite.workspaceName} workspace`;
    const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 8px;font-size:13px;color:#71717a">${who} invited you to collaborate</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.3">Join ${wsName} on Galleo</h1>
    <a href="${invite.url}" style="display:inline-block;padding:11px 20px;background:#18181b;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600">Accept invitation</a>
    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5">This link is unique to you. Please don't forward it. If the button doesn't work, paste this URL into your browser:<br><span style="color:#71717a;word-break:break-all">${escapeHtml(
        invite.url,
    )}</span></p>
    <p style="margin:28px 0 0;font-size:11px;color:#d4d4d8">Sent via Galleo</p>
  </div>
</body></html>`;
    return deliver({ to: invite.to, subject, html });
}
