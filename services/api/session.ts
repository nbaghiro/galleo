import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { LoginBody } from "@model/workspace";
import { db, schema } from "../schema";
import { verifyPassword, makeSession, SESSION_COOKIE } from "../auth";
import { currentUser, readJson } from "./context";

export const session = new Hono();

session.post("/auth/login", async (c) => {
    const { email, password } = await readJson<LoginBody>(c);
    if (!email || !password) return c.json({ error: "email and password are required" }, 400);
    const [u] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.trim().toLowerCase()));
    if (!u || !verifyPassword(password, u.passwordHash))
        return c.json({ error: "invalid email or password" }, 401);
    setCookie(c, SESSION_COOKIE, makeSession(u.id), {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production", // HTTPS-only in prod; dev is http
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ user: { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl } });
});

session.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
});

session.get("/me", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json({ user: u });
});
