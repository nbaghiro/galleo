import { createSignal } from "solid-js";
import { api, type ApiUser } from "../api";
import { clearCustomThemes } from "../theme";

// Session state for the app. bootstrap() runs once at startup to restore an existing session.
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

export async function logout(): Promise<void> {
    await api.logout().catch(() => {});
    clearCustomThemes();
    setUser(null);
}
