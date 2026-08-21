import { createSignal } from "solid-js";
import { api, type AccountConnection, type ApiUser, type AuthProvider } from "@app/api";
import { identifyUser, resetAnalytics } from "@ui/analytics";
import { adoptUserPrefs, clearCustomThemes } from "./theme";

export const [user, setUser] = createSignal<ApiUser | null>(null);
export const [authReady, setAuthReady] = createSignal(false);

// Every path that produces a user runs through here, so the account's stored preferences reach the
// app the same way whether they arrived from a session probe, a login, or a preference write.
function adopt(u: ApiUser): void {
    setUser(u);
    adoptUserPrefs(u.prefs);
    // Keyed by user id, never by email. A session restore identifies the same as a fresh login, so
    // a returning visitor is not a new anonymous person every time.
    identifyUser(u.id, {
        email_verified: u.emailVerified,
        app_theme: u.prefs.appTheme ?? "default",
    });
}

export async function bootstrap(): Promise<void> {
    // /login exists to create a session: probing /me there just prints a 401 in the console for
    // every signed-out visitor. (An authed user who types /login sees the form; logging in or
    // navigating home recovers.) Deep links elsewhere still probe — that's how a live cookie
    // turns into a session.
    if (window.location.pathname === "/login") {
        setAuthReady(true);
        return;
    }
    try {
        const { user: u } = await api.me();
        adopt(u);
    } catch {
        setUser(null);
    }
    setAuthReady(true);
}

export async function login(email: string, password: string): Promise<void> {
    const { user: u } = await api.login(email, password);
    adopt(u);
}

export async function signup(email: string, password: string, name: string): Promise<void> {
    const { user: u } = await api.signup(email, password, name || undefined);
    adopt(u);
}

// the backend signs the user in as part of the reset, so adopt the returned user as login does
export async function resetPassword(token: string, password: string): Promise<void> {
    const { user: u } = await api.resetPassword(token, password);
    adopt(u);
}

export async function updateProfile(name: string | null): Promise<void> {
    const { user: u } = await api.updateProfile(name);
    adopt(u);
}

// The server reissues the session cookie, so the caller stays signed in here while every other
// session this account had is dropped.
export async function changePassword(password: string, current?: string): Promise<void> {
    const { user: u } = await api.changePassword(password, current);
    adopt(u);
}

export async function loadConnections(): Promise<AccountConnection[]> {
    const { connections } = await api.getConnections();
    return connections;
}

export async function unlinkConnection(provider: AuthProvider): Promise<void> {
    await api.unlinkConnection(provider);
}

export async function logout(): Promise<void> {
    await api.logout().catch(() => {});
    clearCustomThemes();
    // Before the redirect, or the next user on a shared machine inherits this identity.
    resetAnalytics();
    // the cookie is gone, so "/" would resolve to the marketing site; /login always serves the app
    window.location.assign("/login");
}
