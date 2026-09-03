/**
 * What an email looks like, separate from how it is delivered.
 *
 * `mail.ts` talks to the provider and to DNS, so it can never run in a browser and its bodies
 * could never be previewed. Everything here is pure: a theme's tokens and a spec in, an HTML
 * string out. That is what lets the studio render every email in every theme without a server.
 *
 * Email is not the app. There are no CSS variables, no stylesheet, and no webfonts worth relying
 * on, so the theme is resolved into inline styles at render time and every family carries a real
 * fallback stack. Layout is tables, because Outlook still ignores flex and grid.
 */
import type { Tokens } from "@themes";

export interface EmailAction {
    label: string;
    url: string;
}

/** the product's library card, redrawn in HTML so it survives images being blocked */
export interface EmailCard {
    title: string;
    format: string;
    meta: string;
    /** absolute URL of the piece's own cover, usually /api/media/asset/<id>. Optional on purpose:
     *  most clients block images by default, so the card has to read without it. */
    image?: string;
}

/**
 * Composable pieces an activation email is built from. Images are blocked by default in most
 * clients, so every one of these is drawn in HTML and needs nothing to load. They are the
 * product's own devices: its cards, its format triple, its theme tokens, its section stack.
 */
export type EmailBlock =
    | { kind: "cards"; cards: EmailCard[] }
    | { kind: "formats"; items: { label: string; note: string }[] }
    | { kind: "themes"; title: string; themes: { name: string; t: Tokens }[] }
    | { kind: "swatches"; roles: { label: string; color: string }[] }
    | { kind: "stack"; rows: { label: string; written: boolean }[] }
    | { kind: "checklist"; items: { text: string; done: boolean }[] }
    | { kind: "quote"; text: string };

export interface EmailSpec {
    subject: string;
    /** the grey line the inbox shows after the subject; without one, clients scrape the markup */
    preheader: string;
    eyebrow?: string;
    heading: string;
    lede?: string;
    /** something a person wrote, quoted back to the reader */
    note?: string;
    /** a one-time code, shown instead of a button */
    code?: string;
    action?: EmailAction;
    /** small facts under the action: what expires, who sent it, what access was granted */
    meta?: string[];
    footnote?: string;
    card?: EmailCard;
    blocks?: EmailBlock[];
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

const escapeHtml = (s: string): string =>
    s.replace(
        /[&<>"']/g,
        (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
    );

// A theme names one family. Clients will almost never have it, so the stack after it is what
// actually renders and has to belong to the same class as the face the theme chose.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const stack = (family: string, fallback: string): string => `'${family}', ${fallback}`;

// Email clients cap corner radius behaviour inconsistently and a large one on a full-width panel
// reads as a mistake rather than a style, so the theme's radius is honoured up to a ceiling.
const radius = (t: Tokens, max = 14): number => Math.min(t.radius ?? 0, max);

// The mark is a Georgia G on the accent, which is exactly what ui/brand.tsx draws and what
// setFavicon renders. Built from a table cell so it needs no image and survives blocking.
const mark = (t: Tokens): string => `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="34" height="34" align="center" valign="middle" bgcolor="${t.accent}"
              style="border-radius:${radius(t, 9)}px;font-family:${SERIF};font-size:20px;font-weight:700;color:${t.onAccent};line-height:34px">G</td>
          <td style="padding-left:11px;font-family:${stack(t.fontDisplay, SERIF)};font-size:17px;font-weight:${t.headingWeight ?? 600};color:${t.ink}">Galleo</td>
        </tr></table>`;

// The library card, with the same Aa specimen the app paints in the artifact's own theme. It says
// what the piece looks like without asking the client to load anything.
// A blocked image must leave the themed tile behind, not a broken icon, so the picture sits on a
// cell that already carries the surface colour and its alt text is empty.
const cover = (t: Tokens, url: string, h: number): string => `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px"><tr>
                    <td height="${h}" bgcolor="${t.surface}" style="border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 8)}px;overflow:hidden;font-size:0;line-height:0">
                      <img src="${escapeHtml(url)}" alt="" width="100%" height="${h}" style="display:block;width:100%;height:${h}px;object-fit:cover;border-radius:${radius(t, 8)}px">
                    </td>
                  </tr></table>`;

const card = (t: Tokens, c: EmailCard): string => `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px">
                <tr><td style="padding:16px 18px;background:${t.bg};border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 12)}px">
                  ${c.image ? cover(t, c.image, 168) : ""}
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                    ${
                        c.image
                            ? ""
                            : `<td width="52" height="52" align="center" valign="middle" bgcolor="${t.surface}"
                        style="border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 8)}px;font-family:${stack(t.fontDisplay, SERIF)};font-size:19px;color:${t.ink};line-height:52px">Aa</td>`
                    }
                    <td style="padding-left:${c.image ? 0 : 14}px">
                      <div style="font-family:${stack(t.fontMono, MONO)};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${t.accent}">${escapeHtml(c.format)}</div>
                      <div style="margin-top:5px;font-family:${stack(t.fontDisplay, SERIF)};font-size:17px;font-weight:${t.headingWeight ?? 600};color:${t.ink}">${escapeHtml(c.title)}</div>
                      <div style="margin-top:4px;font-family:${stack(t.fontBody, SANS)};font-size:12px;color:${t.muted}">${escapeHtml(c.meta)}</div>
                    </td>
                  </tr></table>
                </td></tr>
              </table>`;

const cell = (t: Tokens, inner: string, pad = "14px 15px"): string =>
    `<td valign="top" style="padding:${pad};background:${t.bg};border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 10)}px">${inner}</td>`;

const label = (t: Tokens, txt: string, color?: string): string =>
    `<div style="font-family:${stack(t.fontMono, MONO)};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${color ?? t.accent}">${escapeHtml(txt)}</div>`;

// A row of cells with real gaps: email has no flex, so the gap is an empty column.
const row = (cells: string[], gap = 10): string =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${cells.join(
        `<td width="${gap}" style="font-size:0;line-height:0">&nbsp;</td>`,
    )}</tr></table>`;

function block(t: Tokens, b: EmailBlock): string {
    if (b.kind === "cards")
        return row(
            b.cards.map((c) =>
                cell(
                    t,
                    `
            ${
                c.image
                    ? cover(t, c.image, 96)
                    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="40" height="40" align="center" valign="middle" bgcolor="${t.surface}" style="border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 7)}px;font-family:${stack(t.fontDisplay, SERIF)};font-size:15px;color:${t.ink};line-height:40px">Aa</td>
            </tr></table>`
            }
            <div style="margin-top:${c.image ? 2 : 11}px">${label(t, c.format)}</div>
            <div style="margin-top:5px;font-family:${stack(t.fontDisplay, SERIF)};font-size:14px;font-weight:${t.headingWeight ?? 600};color:${t.ink};line-height:1.3">${escapeHtml(c.title)}</div>
            <div style="margin-top:4px;font-family:${stack(t.fontBody, SANS)};font-size:11px;color:${t.muted}">${escapeHtml(c.meta)}</div>`,
                ),
            ),
        );

    if (b.kind === "formats")
        return row(
            b.items.map((f) =>
                cell(
                    t,
                    `
            ${label(t, f.label)}
            <div style="margin-top:7px;font-family:${stack(t.fontBody, SANS)};font-size:12px;line-height:1.5;color:${t.soft}">${escapeHtml(f.note)}</div>`,
                ),
            ),
        );

    // the same piece in three themes, which is the claim rather than a description of it
    if (b.kind === "themes")
        return row(
            b.themes.map(
                ({ name, t: th }) => `
            <td valign="top" style="padding:14px 14px 15px;background:${th.bg};border:${th.border ?? 1}px solid ${th.line};border-radius:${radius(t, 10)}px">
              ${label(th, name, th.accent)}
              <div style="margin-top:9px;font-family:${stack(th.fontDisplay, SERIF)};font-size:15px;font-weight:${th.headingWeight ?? 600};color:${th.ink};line-height:1.3">${escapeHtml(b.title)}</div>
              <div style="margin-top:8px;height:3px;width:32px;background:${th.accent};font-size:0;line-height:0">&nbsp;</div>
            </td>`,
            ),
        );

    if (b.kind === "swatches")
        return row(
            b.roles.map(
                (r) => `
            <td align="center" style="padding:0">
              <div style="height:34px;background:${r.color};border:${t.border ?? 1}px solid ${t.line};border-radius:${radius(t, 6)}px;font-size:0;line-height:0">&nbsp;</div>
              <div style="margin-top:7px;font-family:${stack(t.fontMono, MONO)};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${t.muted}">${escapeHtml(r.label)}</div>
            </td>`,
            ),
            6,
        );

    if (b.kind === "stack")
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${b.rows
            .map(
                (
                    r,
                ) => `<tr><td style="padding:0 0 8px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td height="34" style="background:${r.written ? t.surface : t.bg};border:${t.border ?? 1}px ${r.written ? "solid" : "dashed"} ${t.line};border-radius:${radius(t, 7)}px;padding:0 13px;font-family:${stack(t.fontBody, SANS)};font-size:12px;color:${r.written ? t.ink : t.muted}">${escapeHtml(r.label)}</td>
            </tr></table></td></tr>`,
            )
            .join("")}</table>`;

    if (b.kind === "checklist")
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${b.items
            .map(
                (i) => `<tr>
              <td width="20" valign="top" style="padding:0 0 10px;font-family:${stack(t.fontBody, SANS)};font-size:13px;color:${i.done ? t.accent : t.muted}">${i.done ? "&#10003;" : "&#9675;"}</td>
              <td valign="top" style="padding:0 0 10px;font-family:${stack(t.fontBody, SANS)};font-size:14px;line-height:1.5;color:${i.done ? t.muted : t.soft}">${escapeHtml(i.text)}</td>
            </tr>`,
            )
            .join("")}</table>`;

    return `<div style="padding:4px 0 2px;font-family:${stack(t.fontDisplay, SERIF)};font-size:21px;line-height:1.4;font-weight:${t.headingWeight ?? 600};color:${t.ink}">${escapeHtml(b.text)}</div>`;
}

const button = (t: Tokens, a: EmailAction): string => `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" bgcolor="${t.accent}" style="border-radius:${radius(t, 10)}px">
                  <a href="${escapeHtml(a.url)}" style="display:inline-block;padding:13px 26px;font-family:${stack(t.fontBody, SANS)};font-size:15px;font-weight:600;color:${t.onAccent};text-decoration:none;border-radius:${radius(t, 10)}px">${escapeHtml(a.label)}</a>
                </td>
              </tr></table>`;

export function renderEmail(t: Tokens, spec: EmailSpec): RenderedEmail {
    const border = t.border ?? 1;
    const parts: string[] = [];

    if (spec.eyebrow)
        parts.push(
            `<p style="margin:0 0 14px;font-family:${stack(t.fontMono, MONO)};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${t.accent}">${escapeHtml(spec.eyebrow)}</p>`,
        );

    parts.push(
        `<h1 style="margin:0 0 16px;font-family:${stack(t.fontDisplay, SERIF)};font-size:27px;line-height:1.25;font-weight:${t.headingWeight ?? 600};color:${t.ink}">${escapeHtml(spec.heading)}</h1>`,
    );

    if (spec.card) parts.push(card(t, spec.card));

    if (spec.lede)
        parts.push(
            `<p style="margin:0 0 24px;font-family:${stack(t.fontBody, SANS)};font-size:15px;line-height:1.6;color:${t.soft}">${escapeHtml(spec.lede)}</p>`,
        );

    if (spec.note)
        parts.push(
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px"><tr><td style="padding:16px 18px;background:${t.bg};border-left:3px solid ${t.accent};border-radius:${radius(t, 8)}px;font-family:${stack(t.fontBody, SANS)};font-size:14px;line-height:1.6;color:${t.soft}">${escapeHtml(spec.note)}</td></tr></table>`,
        );

    if (spec.code)
        parts.push(
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px"><tr><td align="center" style="padding:22px 18px;background:${t.bg};border:${border}px solid ${t.line};border-radius:${radius(t)}px;font-family:${stack(t.fontMono, MONO)};font-size:32px;letter-spacing:.22em;font-weight:600;color:${t.ink}">${escapeHtml(spec.code)}</td></tr></table>`,
        );

    for (const b of spec.blocks ?? [])
        parts.push(`<div style="margin:0 0 26px">${block(t, b)}</div>`);

    if (spec.action) parts.push(button(t, spec.action));

    if (spec.meta?.length)
        parts.push(
            `<p style="margin:24px 0 0;font-family:${stack(t.fontBody, SANS)};font-size:13px;line-height:1.65;color:${t.muted}">${spec.meta.map(escapeHtml).join("<br>")}</p>`,
        );

    if (spec.action)
        parts.push(
            `<p style="margin:20px 0 0;font-family:${stack(t.fontBody, SANS)};font-size:12px;line-height:1.6;color:${t.muted}">If the button does not work, paste this into your browser:<br><span style="color:${t.soft};word-break:break-all">${escapeHtml(spec.action.url)}</span></p>`,
        );

    if (spec.footnote)
        parts.push(
            `<p style="margin:22px 0 0;font-family:${stack(t.fontBody, SANS)};font-size:12px;line-height:1.6;color:${t.muted}">${escapeHtml(spec.footnote)}</p>`,
        );

    const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="${t.bg && isDark(t) ? "dark" : "light"}">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(spec.subject)}</title></head>
<body style="margin:0;padding:0;background:${t.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(spec.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.bg}">
  <tr><td align="center" style="padding:40px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px">
      <tr><td style="padding:0 2px 18px">${mark(t)}</td></tr>
      <tr><td style="font-size:0;line-height:0;height:1px;background:${t.line}">&nbsp;</td></tr>
      <tr><td style="font-size:0;line-height:0;height:3px;background:${t.accent}" width="64">&nbsp;</td></tr>
      <tr><td style="padding:34px 34px 36px;background:${t.surface};border:${border}px solid ${t.line};border-top:0;border-radius:0 0 ${radius(t)}px ${radius(t)}px">
${parts.join("\n")}
      </td></tr>
      <tr><td style="padding:24px 2px 0;font-family:${stack(t.fontMono, MONO)};font-size:10px;letter-spacing:.14em;text-transform:uppercase;line-height:1.8;color:${t.muted}">
        Galleo &middot; <a href="https://galleo.app" style="color:${t.muted};text-decoration:none">galleo.app</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const text = [
        spec.eyebrow,
        spec.heading,
        "",
        spec.lede,
        spec.note && `"${spec.note}"`,
        spec.code && `Code: ${spec.code}`,
        spec.action && `${spec.action.label}: ${spec.action.url}`,
        ...(spec.meta ?? []),
        spec.footnote,
        "",
        "Galleo · galleo.app",
    ]
        .filter(Boolean)
        .join("\n");

    return { subject: spec.subject, html, text };
}

// Clients that honour color-scheme need to be told which one this is, and a dark theme that
// declares light gets its text inverted into illegibility.
function isDark(t: Tokens): boolean {
    const hex = t.bg.replace("#", "");
    const n = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) || 0);
    return (0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0)) / 255 < 0.5;
}

// The five the product sends today. Each one is a spec rather than markup, so the layout above
// is the only place that knows what an email looks like.

export interface VerifyEmail {
    code: string;
    minutes: number;
}

export function verifyEmail(t: Tokens, v: VerifyEmail): RenderedEmail {
    return renderEmail(t, {
        subject: `${v.code} is your Galleo confirmation code`,
        preheader: `Enter this code on the screen you left open. It expires in ${v.minutes} minutes.`,
        eyebrow: "Confirm your email",
        heading: "Here is your code.",
        lede: "Enter it on the screen you left open to finish setting up your account.",
        code: v.code,
        meta: [`It expires in ${v.minutes} minutes.`],
        footnote:
            "If you did not sign up for Galleo, you can ignore this email and nothing will happen.",
    });
}

export interface ResetEmail {
    url: string;
    hours: number;
}

export function resetEmail(t: Tokens, r: ResetEmail): RenderedEmail {
    return renderEmail(t, {
        subject: "Reset your Galleo password",
        preheader: `Choose a new password. The link expires in ${r.hours} hour${r.hours === 1 ? "" : "s"}.`,
        eyebrow: "Password",
        heading: "Choose a new password.",
        lede: "Use the button below to set a new password for your account. Your existing sessions will be signed out.",
        action: { label: "Set a new password", url: r.url },
        meta: [
            `This link expires in ${r.hours} hour${r.hours === 1 ? "" : "s"} and can be used once.`,
        ],
        footnote: "If you did not ask for this, ignore the email. Your password stays as it is.",
    });
}

export interface ShareEmail {
    artifactTitle: string;
    inviterName: string;
    message?: string | null;
    format: string;
    sections: number;
    url: string;
    image?: string;
}

export function shareEmail(t: Tokens, s: ShareEmail): RenderedEmail {
    return renderEmail(t, {
        subject: `${s.inviterName} shared “${s.artifactTitle}” with you`,
        preheader: `${s.inviterName} shared a piece with you. It opens in the browser, with nothing to download.`,
        eyebrow: `${s.inviterName} shared this with you`,
        heading: "Have a read.",
        card: {
            title: s.artifactTitle,
            format: s.format,
            meta: `${s.sections} sections`,
            image: s.image,
        },
        lede: "It opens in your browser. There is nothing to download and no account needed to read it.",
        note: s.message || undefined,
        action: { label: "Open it", url: s.url },
        meta: ["This link is meant for you, so please do not forward it."],
    });
}

export interface CollabEmail {
    artifactTitle: string;
    inviterName: string;
    workspaceName: string;
    verb: string;
    format: string;
    sections: number;
    url: string;
    image?: string;
}

export function collabEmail(t: Tokens, c: CollabEmail): RenderedEmail {
    return renderEmail(t, {
        subject: `${c.inviterName} invited you to ${c.verb} “${c.artifactTitle}”`,
        preheader: `You can ${c.verb} this piece alongside the rest of ${c.workspaceName}.`,
        eyebrow: `${c.inviterName} invited you`,
        heading: `You can ${c.verb} this one.`,
        card: {
            title: c.artifactTitle,
            format: c.format,
            meta: `${c.sections} sections`,
            image: c.image,
        },
        lede: `You can ${c.verb} this piece. Everyone works on the same file at the same time, so there is no version to merge afterwards.`,
        action: { label: "Open it", url: c.url },
        meta: [
            `Shared from ${c.workspaceName}.`,
            "Your access can be changed or removed at any time.",
        ],
    });
}

export interface WorkspaceEmail {
    workspaceName: string;
    inviterName: string;
    role: string;
    url: string;
}

export function workspaceEmail(t: Tokens, w: WorkspaceEmail): RenderedEmail {
    return renderEmail(t, {
        subject: `${w.inviterName} invited you to ${w.workspaceName} on Galleo`,
        preheader: `Join ${w.workspaceName} as ${w.role} and see everything the team has made.`,
        eyebrow: "You have been invited",
        heading: `Join ${w.workspaceName}.`,
        lede: "You will see everything the team has made, and anything you make is shared with them from the start.",
        action: { label: "Accept the invitation", url: w.url },
        meta: [`${w.inviterName} invited you as ${w.role}.`],
    });
}

// Activation. Each one fires on the absence of an event rather than a guess, and each uses a
// different device, so a person who gets three of them does not read the same email three times.

export interface ActivationCtx {
    firstName?: string | null;
    appUrl: string;
}

/** signed up, nothing made yet */
export function startHereEmail(t: Tokens, c: ActivationCtx, starters: EmailCard[]): RenderedEmail {
    return renderEmail(t, {
        subject: "Start from something finished",
        preheader: "Sixty starters, each one a real piece you edit rather than a blank page.",
        eyebrow: "Where to begin",
        heading: "Nobody should start from a blank page.",
        lede: "The shelf opens on sixty starters. Each is a finished piece with the spacing, the type scale and the picture treatment already decided, so the first thing you do is change the words.",
        blocks: [{ kind: "cards", cards: starters.slice(0, 3) }],
        action: { label: "Open the shelf", url: `${c.appUrl}/app` },
    });
}

/** made something, never switched format */
export function threeViewsEmail(t: Tokens, c: ActivationCtx): RenderedEmail {
    return renderEmail(t, {
        subject: "The piece you made is also a document and a site",
        preheader: "Changing the format is a setting, not a rewrite.",
        eyebrow: "One file, three shapes",
        heading: "You have only seen one of the three.",
        lede: "What you wrote is a structured tree, and a format is a view over it. The same content lays itself out three ways through the same engine.",
        blocks: [
            {
                kind: "formats",
                items: [
                    {
                        label: "Deck",
                        note: "Full screen, one section at a time, ready to present.",
                    },
                    { label: "Doc", note: "A reading column, everything in one scroll." },
                    { label: "Site", note: "A published page on a link, no build step." },
                ],
            },
        ],
        action: { label: "Switch the format", url: `${c.appUrl}/app` },
        meta: ["It takes one click and nothing is re-typed between them."],
    });
}

/** never changed the theme */
export function themesEmail(
    t: Tokens,
    c: ActivationCtx,
    trio: { name: string; t: Tokens }[],
): RenderedEmail {
    return renderEmail(t, {
        subject: "Over forty themes, and the piece stays the same",
        preheader: "A theme is a token set, so switching one repaints everything at once.",
        eyebrow: "Themes",
        heading: "The same piece, wearing something else.",
        lede: "A theme is not a skin. It is eight colours by role, three typefaces, a radius and a border, so switching one repaints the type, the charts and the tables together.",
        blocks: [
            { kind: "themes", title: "Ondine · Seed Round", themes: trio },
            {
                kind: "swatches",
                roles: [
                    { label: "bg", color: t.bg },
                    { label: "surface", color: t.surface },
                    { label: "ink", color: t.ink },
                    { label: "accent", color: t.accent },
                    { label: "line", color: t.line },
                ],
            },
        ],
        action: { label: "Try one", url: `${c.appUrl}/app` },
    });
}

/** started a generation and left it */
export function outlineWaitingEmail(
    t: Tokens,
    c: ActivationCtx,
    title: string,
    rows: { label: string; written: boolean }[],
): RenderedEmail {
    const left = rows.filter((r) => !r.written).length;
    return renderEmail(t, {
        subject: `Your outline for “${title}” is still there`,
        preheader: `${left} sections are planned and waiting. Nothing was lost.`,
        eyebrow: "Where you left off",
        heading: "The outline is still waiting.",
        lede: `You approved the arc and ${rows.length - left} sections were written. The rest are still planned, and they build one at a time or all at once.`,
        blocks: [{ kind: "stack", rows }],
        action: { label: "Finish it", url: `${c.appUrl}/app` },
        meta: [`${left} section${left === 1 ? "" : "s"} left to write.`],
    });
}

/** made something, never shared or published it */
export function nobodySeenEmail(t: Tokens, c: ActivationCtx, card: EmailCard): RenderedEmail {
    return renderEmail(t, {
        subject: "Nobody has seen it yet",
        preheader:
            "It is a link before it is a file. No export step between finishing and sending.",
        eyebrow: "Send it",
        heading: "It is a link before it is a file.",
        card,
        lede: "There is no export step between finishing something and sending it. Access is chosen per person, and the link can be given a day it stops working.",
        blocks: [
            {
                kind: "checklist",
                items: [
                    { text: "Written and laid out", done: true },
                    { text: "Shared with someone who needs to read it", done: false },
                    { text: "Published on a link, if it should be public", done: false },
                ],
            },
        ],
        action: { label: "Share it", url: `${c.appUrl}/app` },
    });
}
