import { createSignal } from "solid-js";
import { api, type ApiUser } from "../api";
import { clearCustomThemes } from "./theme";

export const [user, setUser] = createSignal<ApiUser | null>(null);
export const [authReady, setAuthReady] = createSignal(false);

export async function bootstrap(): Promise<void> {
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

// Completes a password reset: the backend sets the new password and signs the user in (cookie), so we
// adopt the returned user just like login/signup.
export async function resetPassword(token: string, password: string): Promise<void> {
    const { user: u } = await api.resetPassword(token, password);
    setUser(u);
}

export async function logout(): Promise<void> {
    await api.logout().catch(() => {});
    clearCustomThemes();
    // Land on the login screen via a fresh load (clears app state). The cookie is gone, so "/" would
    // resolve to the marketing site — go to /login, which always serves the app + its sign-in gate.
    window.location.assign("/login");
}
