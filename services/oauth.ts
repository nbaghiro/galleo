import { Google, MicrosoftEntraId } from "arctic";
import { appUrl } from "./app-url";

// Providers are built lazily from env and memoized, `null` when unconfigured so routes degrade instead of
// crashing. Redirect URIs live on the app origin (/api is proxied here): register ${APP_URL}/api/auth/<p>/callback.

export const OAUTH_SCOPES = ["openid", "profile", "email"];

function env(name: string): string | undefined {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : undefined;
}

let google: Google | null | undefined;
export function googleProvider(): Google | null {
    if (google === undefined) {
        const id = env("GOOGLE_OAUTH_CLIENT_ID");
        const secret = env("GOOGLE_OAUTH_CLIENT_SECRET");
        google = id && secret ? new Google(id, secret, appUrl("/api/auth/google/callback")) : null;
    }
    return google;
}

let microsoft: MicrosoftEntraId | null | undefined;
export function microsoftProvider(): MicrosoftEntraId | null {
    if (microsoft === undefined) {
        const id = env("MICROSOFT_OAUTH_CLIENT_ID");
        const secret = env("MICROSOFT_OAUTH_CLIENT_SECRET");
        const tenant = env("MICROSOFT_TENANT") ?? "common";
        microsoft =
            id && secret
                ? new MicrosoftEntraId(tenant, id, secret, appUrl("/api/auth/microsoft/callback"))
                : null;
    }
    return microsoft;
}

// Which sign-in providers are configured — the auth page enables only the ready buttons.
export function oauthProvidersReady(): { google: boolean; microsoft: boolean } {
    return { google: googleProvider() !== null, microsoft: microsoftProvider() !== null };
}
