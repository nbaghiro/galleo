// @vitest-environment happy-dom
import { Storage } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
    init: vi.fn(),
    capture: vi.fn(),
    register: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_POSTHOG_KEY", "consent-test-key");
    vi.stubGlobal("localStorage", new Storage());
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("optional browser analytics consent", () => {
    it("does not initialize or keep a pre-consent event backlog", async () => {
        const a = await import("@ui/analytics");
        a.initAnalytics("marketing");
        a.capture("logged_out", {});
        await settle();
        expect(sdk.init).not.toHaveBeenCalled();
        a.setAnalyticsConsent("accepted");
        await settle();
        expect(sdk.init).toHaveBeenCalledOnce();
        expect(sdk.capture).not.toHaveBeenCalledWith("logged_out", {}, undefined);
        expect(a.analyticsEnabled()).toBe(true);
    });

    it("honors rejection and stops SDK capture and replay on withdrawal", async () => {
        const a = await import("@ui/analytics");
        localStorage.setItem("galleo:analytics-consent", "essential");
        a.initAnalytics("app");
        await settle();
        expect(sdk.init).not.toHaveBeenCalled();
        a.setAnalyticsConsent("accepted");
        await settle();
        a.setAnalyticsConsent("essential");
        sdk.capture.mockClear();
        a.capture("logged_out", {});
        a.resumeReplay();
        expect(sdk.capture).not.toHaveBeenCalled();
        expect(sdk.opt_out_capturing).toHaveBeenCalledOnce();
        expect(sdk.stopSessionRecording).toHaveBeenCalled();
        expect(a.analyticsEnabled()).toBe(false);
        expect(localStorage.getItem("galleo:analytics-consent")).toBe("essential");
    });

    it("cancels initialization if consent is withdrawn during the SDK import", async () => {
        const a = await import("@ui/analytics");
        a.initAnalytics("app");
        a.setAnalyticsConsent("accepted");
        a.setAnalyticsConsent("essential");
        await settle();
        expect(sdk.init).not.toHaveBeenCalled();
    });

    it("keeps editor replay paused and adopts current identity after consent", async () => {
        const a = await import("@ui/analytics");
        a.initAnalytics("app");
        a.identifyUser("user-1", { email_verified: true });
        a.pauseReplay();
        a.setAnalyticsConsent("accepted");
        await settle();
        expect(sdk.init).toHaveBeenCalledWith(
            "consent-test-key",
            expect.objectContaining({ disable_session_recording: true }),
        );
        expect(sdk.identify).toHaveBeenCalledWith("user-1", { email_verified: true });
    });

    it("does not start optional analytics in a published customer artifact", async () => {
        const a = await import("@ui/analytics");
        localStorage.setItem("galleo:analytics-consent", "accepted");
        a.initAnalytics("publish");
        await settle();
        expect(sdk.init).not.toHaveBeenCalled();
    });
});
