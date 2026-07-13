import { setContext } from "@ui/keys";

// router-free (only @ui/keys) so it stays unit-testable — sibling stores pull @solidjs/router, which throws in the vitest server build
export function publishRoute(pathname: string): void {
    const p = pathname.replace(/^\/app/, "") || "/";
    setContext("app", true);
    setContext("library", p === "/" || p.startsWith("/folder"));
    setContext("templates", p === "/templates");
    setContext("shared", p === "/shared");
    setContext("trash", p === "/trash");
    setContext("pricing", p === "/pricing");
    setContext("editor", p.startsWith("/edit"));
}
