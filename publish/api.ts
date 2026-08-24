import type { ArtifactContent } from "@model/artifact";
import { asContent } from "@model/artifact";
import type { MediaCredit } from "@model/media";
import type { NarrationManifest, Soundtrack } from "@model/speech";
import type { Tokens } from "@themes";

// The public viewer's whole client: three unauthenticated reads of /p/:slug, and the shapes they
// answer with. Here rather than in @app/api because publish is its own build and its readers are a
// customer's audience, so pulling the product's authenticated client in to reach three endpoints
// shipped the entire API surface to them. Nothing else calls these.
//
// The DTOs are wire shapes and could be promoted to @model if the backend ever wants to share one
// definition; PublicResult could not, since a gate read from a 401 body is client-side handling.

// custom theme rides along; built-ins are already in the viewer's registry
export interface CustomThemeRecord {
    id: string;
    name: string;
    tag: string;
    dark: boolean;
    tokens: Tokens;
}

export interface PublicContent {
    title: string;
    content: ArtifactContent;
    branded: boolean;
    customTheme: CustomThemeRecord | null;
    credits: MediaCredit[];
}

// content or a gate; a gated response still carries the theme so the prompt shows themed
export type PublicResult =
    | { ok: true; content: PublicContent }
    | {
          ok: false;
          status: number;
          needsPassword?: boolean;
          theme?: string;
          customTheme?: CustomThemeRecord | null;
          format?: string;
      };

// an unauthenticated raw body, so the shape is checked here; asContent() fills the shell defaults
// rather than trusting the payload to be an ArtifactContent because the column said so
function readPublicContent(d: Record<string, unknown>): PublicContent | null {
    if (typeof d.title !== "string" || typeof d.content !== "object" || d.content === null) {
        return null;
    }
    return {
        title: d.title,
        content: asContent(d.content),
        branded: d.branded === true,
        customTheme: (d.customTheme as CustomThemeRecord | null | undefined) ?? null,
        credits: Array.isArray(d.credits) ? (d.credits as MediaCredit[]) : [],
    };
}

// the gate travels on every read: a password or a recipient token
const gated = (opts?: { pw?: string; k?: string; ref?: string }): string => {
    const q = new URLSearchParams();
    if (opts?.pw) q.set("pw", opts.pw);
    if (opts?.k) q.set("k", opts.k);
    if (opts?.ref) q.set("ref", opts.ref.slice(0, 300));
    const qs = q.toString();
    return qs ? `?${qs}` : "";
};

export const publicApi = {
    // The narration behind the same gate the content went through, so a password or a recipient
    // token protects the audio too. Empty rather than an error when nothing is prepared.
    getPublicSoundtrack: async (
        slug: string,
        opts?: { pw?: string; k?: string },
    ): Promise<Soundtrack | null> => {
        const res = await fetch(`/api/p/${slug}/soundtrack${gated(opts)}`, {
            credentials: "same-origin",
        });
        if (!res.ok) return null;
        return ((await res.json()) as { track: Soundtrack | null }).track;
    },

    getPublicNarration: async (
        slug: string,
        opts?: { pw?: string; k?: string },
    ): Promise<NarrationManifest> => {
        const res = await fetch(`/api/p/${slug}/narration${gated(opts)}`, {
            credentials: "same-origin",
        });
        if (!res.ok) return { tracks: [], stale: [] };
        return (await res.json()) as NarrationManifest;
    },

    getPublicContent: async (
        slug: string,
        opts?: { pw?: string; k?: string; ref?: string },
    ): Promise<PublicResult> => {
        // a gated 401/429 isn't an error here — read its body
        const res = await fetch(`/api/p/${slug}/content${gated(opts)}`, {
            credentials: "same-origin",
        });
        let data: Record<string, unknown> = {};
        try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
        } catch {
            /* non-JSON body */
        }
        if (res.ok) {
            const content = readPublicContent(data);
            // a 200 whose body isn't the expected shape is a broken response, not content
            if (content) return { ok: true, content };
            return { ok: false, status: 502, customTheme: null };
        }
        return {
            ok: false,
            status: res.status,
            needsPassword: data.needsPassword === true,
            theme: typeof data.theme === "string" ? data.theme : undefined,
            customTheme: (data.customTheme as CustomThemeRecord | null | undefined) ?? null,
            format: typeof data.format === "string" ? data.format : undefined,
        };
    },
};
