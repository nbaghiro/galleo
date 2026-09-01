import type { PostHog } from "posthog-js";
import type {
    DeviceTier,
    EventName,
    EventProps,
    PersonTraits,
    SuperProperties,
    WorkspaceTraits,
} from "@model/analytics";
import { GROUP_TYPE } from "@model/analytics";
import { viewportTier } from "./viewport";

// Product analytics, browser side. Lives in @ui because both the editor and the app emit and this
// is the lowest layer both may import; editor may not reach into app.
//
// Explicit events only: autocapture and pageview capture are off,
// because the editor canvas is painted imperatively by the engine and autocapture would produce a
// flood of anonymous div clicks that mean nothing.
//
// Events go to a first-party path on our own origin, which is what keeps them alive through the ad
// blockers a meaningful share of this audience runs. The path is deliberately not named analytics,
// tracking, or posthog.
//
// No key means no init, which means no network calls. Dev and CI never emit.

const INGEST_PATH = "/api/i";

/** Where the PostHog app itself lives, so the toolbar and links resolve past the proxy. */
const UI_HOST = "https://us.posthog.com";

/** Pins behaviour across SDK upgrades, so a new default cannot switch capture on for us. */
const CONFIG_DEFAULTS = "2026-08-29";

/** Which of the three bundles is running. Each one warrants a different capture policy. */
export type CaptureSurface = "app" | "marketing" | "publish";

// The config type is not exported on its own, but the instance carries it.
type Config = Partial<PostHog["config"]>;

/**
 * Everything we turn off, as data rather than as a line buried in a call, so a test can assert it.
 *
 * Shared by all three surfaces. Autocapture stays off everywhere: it is meaningless over a canvas
 * the engine paints, and on a marketing page an explicit CTA event says more than a div click.
 * Replay can never carry text, because the editor paints the customer's own copy into real DOM
 * spans (`canvas/render/backends.ts`).
 */
const BASE = {
    defaults: CONFIG_DEFAULTS,
    autocapture: false,
    disable_surveys: true,
    disable_web_experiments: true,
    // Nothing lazy-loads from the assets host, so every request stays first-party.
    disable_external_dependency_loading: true,
    // An exception message can carry the content that produced it, so it never travels.
    capture_exceptions: false,
    // An anonymous visitor costs a profile we would never query; only identified people matter.
    person_profiles: "identified_only",
    session_recording: {
        maskTextSelector: "*",
        maskAllInputs: true,
    },
} as const;

/**
 * The three surfaces differ in one question: is a page view the event, or noise?
 *
 * In the app it is noise, because the interesting acts are explicit and the editor repaints
 * constantly. On the marketing site it *is* the event: it carries the referrer and the campaign
 * parameters, which is the whole of paid-traffic attribution, and PostHog persists those and
 * applies them when a person is later created at signup.
 *
 * The publish viewer is a third case. Those readers are our customer's audience rather than ours,
 * looking at content its author considers confidential, so it counts reach and nothing else: no
 * campaign parameters, no referrer, no replay, and memory persistence so nobody is given an id
 * that outlives the page.
 */
export const policyFor = (surface: CaptureSurface): Config => {
    if (surface === "marketing")
        return {
            ...BASE,
            capture_pageview: true,
            capture_pageleave: true,
            disable_session_recording: false,
        } as const;
    if (surface === "publish")
        return {
            ...BASE,
            capture_pageview: true,
            capture_pageleave: false,
            disable_session_recording: true,
            save_campaign_params: false,
            save_referrer: false,
            persistence: "memory",
        } as const;
    return {
        ...BASE,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: false,
    } as const;
};

// The SDK is 80kB gzipped, on the critical path of an editor that is already the biggest chunk we
// ship, so it loads only once a key says it will be used. Calls made while it is in flight queue
// rather than drop, since a sign-in can easily beat the download.
const QUEUE_CAP = 50;

let enabled = false;
let client: PostHog | null = null;
const pending: ((ph: PostHog) => void)[] = [];

export const analyticsEnabled = (): boolean => enabled;

const run = (fn: (ph: PostHog) => void): void => {
    if (client) fn(client);
    else if (enabled && pending.length < QUEUE_CAP) pending.push(fn);
};

export function initAnalytics(surface: CaptureSurface = "app"): void {
    const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
    if (!key || enabled || typeof window === "undefined") return;
    enabled = true;
    void import("posthog-js")
        .then(({ default: posthog }) => {
            posthog.init(key, {
                ...policyFor(surface),
                api_host: `${window.location.origin}${INGEST_PATH}`,
                ui_host: import.meta.env.VITE_POSTHOG_HOST?.trim() || UI_HOST,
            });
            client = posthog;
            register({ app_build: import.meta.env.VITE_APP_BUILD ?? "dev", device_tier: tier() });
            for (const fn of pending.splice(0)) fn(posthog);
        })
        .catch(() => {
            // A blocked or failed chunk is not worth an error the user sees; analytics stays off.
            enabled = false;
            pending.length = 0;
        });
}

// The assignment is the seam: a member added to `Tier` in @ui/viewport fails to compile here rather
// than arriving as an unrecognised string in the data.
const tier = (): DeviceTier => viewportTier();

/** Attach to every subsequent event. Called again whenever the plan or the balance moves. */
export function register(props: Partial<SuperProperties>): void {
    run((ph) => ph.register(props));
}

// Both identify calls are billable events, and their callers run after every mutation that could
// have changed anything: a workspace reload fires on rename, invite, role change and six others.
// Deduping here rather than at the callers means a caller that moves, or a new one, gets it free.
let lastPerson = "";
let lastGroup = "";

const unchanged = (key: string, last: string): boolean => key === last;

/** Keyed by user id, never by email. Called on login and on session restore alike. */
export function identifyUser(userId: string, traits: Partial<PersonTraits>): void {
    const key = `${userId}|${JSON.stringify(traits)}`;
    if (unchanged(key, lastPerson)) return;
    lastPerson = key;
    run((ph) => ph.identify(userId, traits));
}

/** The workspace is the billing entity, so usage is readable per tenant. Re-called on a switch. */
export function setWorkspace(workspaceId: string, traits?: Partial<WorkspaceTraits>): void {
    const key = `${workspaceId}|${JSON.stringify(traits ?? {})}`;
    if (unchanged(key, lastGroup)) return;
    lastGroup = key;
    run((ph) => ph.group(GROUP_TYPE, workspaceId, traits));
}

/** Without this the next user on a shared machine inherits the previous identity. */
export function resetAnalytics(): void {
    lastPerson = "";
    lastGroup = "";
    run((ph) => ph.reset());
}

/**
 * Stop recording for surfaces where replay costs more than it tells us.
 *
 * The engine repaints the whole section stack on every layout change, so the editor produces a
 * mutation stream that is heavy to record and noisy to watch. Masking already keeps the customer's
 * copy out of every recording; this is about volume, not content.
 */
export function pauseReplay(): void {
    run((ph) => ph.stopSessionRecording());
}

export function resumeReplay(): void {
    run((ph) => ph.startSessionRecording());
}

// The request currently open, when there is one. Set around an AI turn, which is the case the
// client-to-server join exists for; unset otherwise, so an unrelated event carries no id rather
// than a wrong one.
let requestId: string | null = null;

export const setRequestId = (id: string | null): void => {
    requestId = id;
};

/**
 * `beacon` is for an event fired immediately before a navigation: the batch timer will not get a
 * chance to run, and a normal request is cancelled when the page goes away.
 */
export function capture<N extends EventName>(
    event: N,
    props: EventProps<N>,
    opts?: { beacon?: boolean },
): void {
    const withId = requestId ? { ...props, request_id: requestId } : props;
    run((ph) => ph.capture(event, withId, opts?.beacon ? { transport: "sendBeacon" } : undefined));
}
