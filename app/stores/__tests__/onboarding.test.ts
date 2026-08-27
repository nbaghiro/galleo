// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Template } from "@model/templates";

// The seam is the prefs write, because that is the whole mechanism: `needed` is derived server-side
// as `!startedAt && artifacts === 0`, so what the client sends decides whether the library redirect
// in AppShell lets the user through or throws them back onto the welcome screen.
const updatePrefs = vi.fn();
const getOnboarding = vi.fn();
const createArtifact = vi.fn();
// the catalog is mocked at the store, not the API: templatesOnce caches for the session by design,
// so a second case would otherwise be served the first one's templates
const templatesOnce = vi.fn();

vi.mock("@app/api", () => ({ api: { updatePrefs, getOnboarding, createArtifact } }));
vi.mock("@app/stores/templates", () => ({ templatesOnce }));
vi.mock("@app/stores/auth", () => ({ setUser: vi.fn(), user: () => null }));
vi.mock("@app/stores/theme", () => ({ appTheme: () => "studio" }));
vi.mock("@ui/analytics", () => ({ capture: vi.fn() }));

const { chooseFormat, skipOnboarding, starterWall } = await import("@app/stores/onboarding");

const tpl = (id: string, format: string): Template => ({
    id,
    name: id,
    category: "Pitch & sell",
    description: "",
    content: { format, theme: "studio", sections: [] },
});

beforeEach(() => {
    vi.clearAllMocks();
    updatePrefs.mockResolvedValue({ user: { prefs: {} } });
    getOnboarding.mockResolvedValue({ onboarding: { needed: false, done: [], dismissed: false } });
});

describe("skipOnboarding", () => {
    it("records the start with no format, which is what releases the library redirect", async () => {
        expect(await skipOnboarding(12)).toBe(true);
        const sent = updatePrefs.mock.calls[0]![0] as { onboarding: Record<string, unknown> };
        expect(sent.onboarding.startedAt).toEqual(expect.any(String));
        expect(sent.onboarding.format).toBeUndefined(); // never told us, so the studio keeps its own
    });

    it("reports failure rather than navigating away from a choice that did not land", async () => {
        updatePrefs.mockRejectedValue(new Error("offline"));
        expect(await skipOnboarding(12)).toBe(false);
    });
});

describe("chooseFormat", () => {
    it("records the answer before creating, so a failed starter still lets the user out", async () => {
        createArtifact.mockRejectedValue(new Error("nope"));
        expect(await chooseFormat("deck", tpl("t1", "deck"))).toBeNull();
        expect(updatePrefs).toHaveBeenCalledOnce();
    });
});

describe("starterWall", () => {
    it("deals round-robin across the formats, so consecutive cards are different types", async () => {
        templatesOnce.mockResolvedValue([
            tpl("d1", "deck"),
            tpl("d2", "deck"),
            tpl("d3", "deck"),
            tpl("w1", "web"),
            tpl("o1", "doc"),
        ]);
        const order = (await starterWall(["deck", "doc", "web"])).map((t) => t.content.format);
        // the first pass is one of each; the formats that run out simply stop dealing
        expect(order).toEqual(["deck", "doc", "web", "deck", "deck"]);
    });

    it("returns the whole catalog, since the wall scrolls to all of it", async () => {
        const many = Array.from({ length: 40 }, (_, i) => tpl(`t${i}`, i % 2 ? "deck" : "web"));
        templatesOnce.mockResolvedValue(many);
        expect(await starterWall(["deck", "doc", "web"])).toHaveLength(40);
    });
});
