import { Google } from "arctic";
import { appUrl } from "./app-url";

// built lazily from env and memoized; null when unconfigured, so routes degrade instead of crashing
// (the redirect URI to register is ${APP_URL}/api/auth/google/callback)

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

// the auth page enables only the ready buttons
export function oauthProvidersReady(): { google: boolean } {
    return { google: googleProvider() !== null };
}
