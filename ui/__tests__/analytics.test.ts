// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    analyticsEnabled,
    capture,
    CAPTURE_POLICY,
    identifyUser,
    initAnalytics,
    register,
    resetAnalytics,
    setWorkspace,
} from "@ui/analytics";

describe("capture policy", () => {
    // Autocapture over a canvas the engine paints imperatively is a flood of anonymous div clicks,
    // and a replay of it is enormous and carries the customer's own copy.
    it("turns off everything that would capture without being asked", () => {
        expect(CAPTURE_POLICY.autocapture).toBe(false);
        expect(CAPTURE_POLICY.capture_pageview).toBe(false);
        expect(CAPTURE_POLICY.capture_pageleave).toBe(false);
        expect(CAPTURE_POLICY.disable_surveys).toBe(true);
        expect(CAPTURE_POLICY.capture_exceptions).toBe(false);
    });

    // The editor paints the customer's own copy into real DOM spans, so a recording that could
    // carry text would be a video of a confidential deck.
    it("records sessions but can never record their text", () => {
        expect(CAPTURE_POLICY.disable_session_recording).toBe(false);
        expect(CAPTURE_POLICY.session_recording.maskTextSelector).toBe("*");
        expect(CAPTURE_POLICY.session_recording.maskAllInputs).toBe(true);
    });

    it("keeps every request first-party and every profile identified", () => {
        expect(CAPTURE_POLICY.disable_external_dependency_loading).toBe(true);
        expect(CAPTURE_POLICY.person_profiles).toBe("identified_only");
    });

    // A new SDK default must not be able to switch capture on for us between upgrades.
    it("pins the SDK defaults rather than following them", () => {
        expect(CAPTURE_POLICY.defaults).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("with no key configured", () => {
    let realFetch: typeof globalThis.fetch;
    let networkCalls: number;

    beforeEach(() => {
        networkCalls = 0;
        realFetch = globalThis.fetch;
        globalThis.fetch = ((...args: Parameters<typeof globalThis.fetch>) => {
            networkCalls += 1;
            return realFetch(...args);
        }) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    it("never initialises, so nothing reaches the network", () => {
        initAnalytics();
        expect(analyticsEnabled()).toBe(false);

        register({ plan_id: "free" });
        identifyUser("user_1", { email_verified: true });
        setWorkspace("ws_1", { plan_id: "free" });
        capture("logged_out", {});
        resetAnalytics();

        expect(networkCalls).toBe(0);
    });
});
