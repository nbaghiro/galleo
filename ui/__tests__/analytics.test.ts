// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    analyticsEnabled,
    capture,
    identifyUser,
    initAnalytics,
    policyFor,
    register,
    resetAnalytics,
    setWorkspace,
} from "@ui/analytics";

describe("what every surface refuses to capture", () => {
    // Autocapture over a canvas the engine paints imperatively is a flood of anonymous div clicks,
    // and an exception message can carry the content that produced it.
    it("never autocaptures and never captures exceptions", () => {
        for (const surface of ["app", "marketing", "publish"] as const) {
            expect(policyFor(surface).autocapture).toBe(false);
            expect(policyFor(surface).capture_exceptions).toBe(false);
            expect(policyFor(surface).disable_surveys).toBe(true);
        }
    });

    // The editor paints the customer's own copy into real DOM spans, so a recording that could
    // carry text would be a video of a confidential deck.
    it("can never record text, wherever recording is on", () => {
        for (const surface of ["app", "marketing", "publish"] as const) {
            expect(policyFor(surface).session_recording?.maskTextSelector).toBe("*");
            expect(policyFor(surface).session_recording?.maskAllInputs).toBe(true);
        }
    });

    it("keeps every request first-party and every profile identified", () => {
        for (const surface of ["app", "marketing", "publish"] as const) {
            expect(policyFor(surface).disable_external_dependency_loading).toBe(true);
            expect(policyFor(surface).person_profiles).toBe("identified_only");
        }
    });

    // A new SDK default must not be able to switch capture on for us between upgrades.
    it("pins the SDK defaults rather than following them", () => {
        expect(policyFor("app").defaults).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("where a page view is the event", () => {
    // In the app the interesting acts are explicit and the editor repaints constantly, so a page
    // view says nothing. On the marketing site it carries the referrer and the campaign params,
    // which is the whole of paid-traffic attribution.
    it("counts page views on marketing and publish, not in the app", () => {
        expect(policyFor("app").capture_pageview).toBe(false);
        expect(policyFor("marketing").capture_pageview).toBe(true);
        expect(policyFor("publish").capture_pageview).toBe(true);
    });

    // A public-link reader is our customer's audience, not ours, looking at content its author
    // considers confidential: count the visit, follow nobody.
    it("gives a public-link reader no attribution, no recording and no lasting id", () => {
        const p = policyFor("publish");
        expect(p.save_campaign_params).toBe(false);
        expect(p.save_referrer).toBe(false);
        expect(p.disable_session_recording).toBe(true);
        expect(p.persistence).toBe("memory");
    });

    // Campaign params and referrer are left at their defaults on marketing, which is how fbclid and
    // the rest arrive without us listing them.
    it("leaves marketing attribution to the SDK's own defaults", () => {
        const p = policyFor("marketing") as { save_campaign_params?: boolean };
        expect(p.save_campaign_params).toBeUndefined();
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
        initAnalytics("marketing");
        expect(analyticsEnabled()).toBe(false);

        register({ plan_id: "free" });
        identifyUser("user_1", { email_verified: true });
        setWorkspace("ws_1", { plan_id: "free" });
        capture("logged_out", {});
        resetAnalytics();

        expect(networkCalls).toBe(0);
    });
});
