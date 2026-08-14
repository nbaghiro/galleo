import { createSignal } from "solid-js";
import { api, type ApiUser } from "../api";
import { clearCustomThemes } from "./theme";

export const [user, setUser] = createSignal<ApiUser | null>(null);
export const [authReady, setAuthReady] = createSignal(false);

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
        setUser(u);
    } catch {
        setUser(null);
    }
    setAuthReady(true);
}

export async function login(email: string, password: string): Promise<void> {
    const { user: u } = await api.login(email, password);
    setUser(u);
}

export async function signup(email: string, password: string, name: string): Promise<void> {
    const { user: u } = await api.signup(email, password, name || undefined);
    setUser(u);
}

// the backend signs the user in as part of the reset, so adopt the returned user as login does
export async function resetPassword(token: string, password: string): Promise<void> {
    const { user: u } = await api.resetPassword(token, password);
    setUser(u);
}

export async function logout(): Promise<void> {
    await api.logout().catch(() => {});
    clearCustomThemes();
    // the cookie is gone, so "/" would resolve to the marketing site; /login always serves the app
    window.location.assign("/login");
}
