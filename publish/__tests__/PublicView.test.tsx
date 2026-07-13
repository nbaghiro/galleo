import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import type { ArtifactContent } from "@model/artifact";
import type { PublicContent, PublicResult } from "../../app/api";
import { renderComponent, type Rendered } from "../../ui/test/render";

// Component test for the public viewer's load() status→state machine. `api.getPublicContent` is the
// network seam (mocked); `@solidjs/router` supplies the real :slug / ?k route context via a MemoryRouter.
// Each branch resolves a canned PublicResult and we assert the one distinguishing element it renders.

// The api is the only network fake. Hoisted so the mock factory can close over the shared spy.
const { getPublicContent } = vi.hoisted(() => ({ getPublicContent: vi.fn() }));
vi.mock("../../app/api", () => ({ api: { getPublicContent } }));

// Import after the mock is registered (vi.mock is hoisted above imports, so the static import is safe).
import { PublicView } from "../PublicView";

// A minimal, engine-safe artifact: continuous (web) format, no sections — paints to an empty stack.
const artifact: ArtifactContent = { format: "web", theme: "studio", sections: [] };
const publicContent: PublicContent = {
    title: "My Public Deck",
    content: artifact,
    branded: true,
    customTheme: null,
};

// Mount PublicView under a MemoryRouter seeded at `url`, matching the real /p/:slug route.
function mountAt(url: string): Rendered {
    const history = createMemoryHistory();
    history.set({ value: url, replace: true }); // replace the initial "/" so useParams() sees the slug
    return renderComponent(() => (
        <MemoryRouter history={history}>
            <Route path="/p/:slug" component={PublicView} />
        </MemoryRouter>
    ));
}

const text = (r: Rendered): string => r.container.textContent ?? "";

beforeEach(() => {
    getPublicContent.mockReset();
});

describe("PublicView load() state machine", () => {
    it("ok → renders the present surface + branding watermark and wires the :slug param", async () => {
        const ok: PublicResult = { ok: true, content: publicContent };
        getPublicContent.mockResolvedValue(ok);

        const r = mountAt("/p/testslug");

        await vi.waitFor(() => {
            expect(r.container.querySelector('a[href="https://galleo.app"]')).not.toBeNull();
        });
        // PublicView's own free-tier watermark (branded: true) sits over the shared present surface.
        const mark = r.container.querySelector('a[href="https://galleo.app"]');
        expect(mark?.textContent).toContain("Made with Galleo");
        // The shared present overlay is mounted (fixed full-screen backdrop).
        expect(r.container.querySelector("div.fixed.inset-0")).not.toBeNull();
        // createEffect syncs the tab title to the artifact's title.
        expect(document.title).toBe("My Public Deck");
        // Router wiring: slug from the path, no ?k / password on first load.
        expect(getPublicContent).toHaveBeenCalledWith("testslug", { k: undefined, pw: undefined });
    });

    it("ok → forwards the ?k private-link token from the query string", async () => {
        getPublicContent.mockResolvedValue({
            ok: true,
            content: publicContent,
        } satisfies PublicResult);

        mountAt("/p/testslug?k=secret-token");

        await vi.waitFor(() => {
            expect(getPublicContent).toHaveBeenCalledWith("testslug", {
                k: "secret-token",
                pw: undefined,
            });
        });
    });

    it("401 → renders the password gate (prompt + password input)", async () => {
        const gate: PublicResult = {
            ok: false,
            status: 401,
            needsPassword: true,
            theme: "studio",
            format: "deck",
        };
        getPublicContent.mockResolvedValue(gate);

        const r = mountAt("/p/protected");

        await vi.waitFor(() => {
            expect(text(r)).toContain("Password required");
        });
        expect(r.container.querySelector('input[type="password"]')).not.toBeNull();
        expect(text(r)).toContain("This document is protected. Enter its password to view it.");
        // No error note before an attempt is made.
        expect(text(r)).not.toContain("Incorrect password.");
        // Not the neutral panels.
        expect(text(r)).not.toContain("Something went wrong");
    });

    it("429 → password gate shows the rate-limit copy", async () => {
        const limited: PublicResult = { ok: false, status: 429, theme: "studio", format: "web" };
        getPublicContent.mockResolvedValue(limited);

        const r = mountAt("/p/protected");

        await vi.waitFor(() => {
            expect(text(r)).toContain("Too many attempts — try again in a few minutes.");
        });
        expect(r.container.querySelector('input[type="password"]')).not.toBeNull();
    });

    it("404 → renders the not-found copy", async () => {
        const notfound: PublicResult = { ok: false, status: 404 };
        getPublicContent.mockResolvedValue(notfound);

        const r = mountAt("/p/gone");

        await vi.waitFor(() => {
            expect(text(r)).toContain("This link isn’t available");
        });
        expect(text(r)).toContain(
            "The link may have been unpublished, or the address is incorrect.",
        );
        expect(r.container.querySelector('input[type="password"]')).toBeNull();
    });

    it("other status → renders the generic error copy", async () => {
        const error: PublicResult = { ok: false, status: 500 };
        getPublicContent.mockResolvedValue(error);

        const r = mountAt("/p/boom");

        await vi.waitFor(() => {
            expect(text(r)).toContain("Something went wrong");
        });
        expect(text(r)).toContain("Please try again in a moment.");
    });

    it("thrown network error → renders the generic error copy", async () => {
        getPublicContent.mockRejectedValue(new Error("network down"));

        const r = mountAt("/p/boom");

        await vi.waitFor(() => {
            expect(text(r)).toContain("Something went wrong");
        });
    });

    it("password submit → re-loads with the entered password and flips to the surface", async () => {
        getPublicContent
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                needsPassword: true,
                theme: "studio",
                format: "deck",
            } satisfies PublicResult)
            .mockResolvedValueOnce({ ok: true, content: publicContent } satisfies PublicResult);

        const r = mountAt("/p/protected");

        await vi.waitFor(() => {
            expect(r.container.querySelector('input[type="password"]')).not.toBeNull();
        });
        const input = r.container.querySelector<HTMLInputElement>('input[type="password"]');
        const form = r.container.querySelector("form");
        expect(input).not.toBeNull();
        expect(form).not.toBeNull();
        input!.value = "hunter2";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        await vi.waitFor(() => {
            expect(r.container.querySelector('a[href="https://galleo.app"]')).not.toBeNull();
        });
        expect(getPublicContent).toHaveBeenLastCalledWith("protected", {
            k: undefined,
            pw: "hunter2",
        });
    });
});

describe("viewLabel (via the gate unlock button)", () => {
    const buttonLabel = async (format?: string): Promise<string> => {
        const gate: PublicResult = { ok: false, status: 401, theme: "studio", format };
        getPublicContent.mockResolvedValue(gate);
        const r = mountAt("/p/protected");
        await vi.waitFor(() => {
            expect(r.container.querySelector('button[type="submit"]')).not.toBeNull();
        });
        return r.container.querySelector('button[type="submit"]')?.textContent?.trim() ?? "";
    };

    it("deck → 'View deck'", async () => {
        expect(await buttonLabel("deck")).toBe("View deck");
    });

    it("web → 'View site'", async () => {
        expect(await buttonLabel("web")).toBe("View site");
    });

    it("doc → 'View document'", async () => {
        expect(await buttonLabel("doc")).toBe("View document");
    });

    it("unknown/absent → 'View artifact'", async () => {
        expect(await buttonLabel(undefined)).toBe("View artifact");
    });
});
