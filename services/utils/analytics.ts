import { AsyncLocalStorage } from "node:async_hooks";
import { PostHog } from "posthog-node";
import type {
    EventName,
    EventProps,
    PersonTraits,
    SuperProperties,
    WorkspaceTraits,
} from "@model/analytics";
import { GROUP_TYPE } from "@model/analytics";
import { warn } from "./env";

// Product analytics, server side. Database-free, so it stays in utils where every layer above can
// reach it: the two highest-value events (paywall_hit, credits_exhausted) are raised in http.ts,
// and utils may not import core.
//
// Server-side is authoritative for anything a client could misreport or miss: credit spend, a
// generation that finishes after the tab closed, a plan change that arrives by Stripe webhook with
// no client in the request at all.
//
// No key means no client, which means no network calls and no output. Dev, CI and the test suite
// never emit.

const DEFAULT_HOST = "https://us.i.posthog.com";

// A long-lived process, not a lambda: batch a real number of events and let the timer drain the
// tail, rather than flushing every event on its own request.
const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 10_000;

/** How long a shutdown waits for the queue to drain before giving up on it. */
const SHUTDOWN_MS = 5_000;

/** The shape posthog-node posts through, narrowed to what we depend on. */
export type Transport = (
    url: string,
    options: { method: string; headers: Record<string, string>; body?: string | Blob },
) => Promise<{ status: number; text: () => Promise<string>; json: () => Promise<unknown> }>;

export interface AnalyticsOptions {
    key?: string;
    host?: string;
    /** Substituted in tests, so what would have been sent is assertable without a network. */
    fetch?: Transport;
}

// The request's own id, in scope for everything it does. An async-local store rather than an
// argument, so a core function twelve frames down reports the request it is serving without
// anything having to thread it there. The meter in core/ai does the same for token spans.
const requestScope = new AsyncLocalStorage<string>();

/** Runs `fn` with `id` attached to every event captured inside it, however deep. */
export const withRequestId = <T>(id: string, fn: () => T): T => requestScope.run(id, fn);

let client: PostHog | null = null;
let started = false;
let build = "unknown";

/**
 * Build the client, or leave it absent when no key is configured.
 *
 * Called once at boot by `services/server.ts` and lazily by the first capture otherwise, so a
 * script or a test that never boots the server still behaves.
 */
export function initAnalytics(options: AnalyticsOptions = {}): void {
    started = true;
    // Stamped on every server event so a regression can be bounded to a deploy, the same as the
    // browser's VITE_APP_BUILD. Render injects the sha; a local run says so rather than guessing.
    build = process.env.RENDER_GIT_COMMIT?.trim().slice(0, 7) || "local";
    const key = options.key ?? process.env.POSTHOG_KEY?.trim();
    if (!key) return;
    client = new PostHog(key, {
        host: options.host ?? process.env.POSTHOG_HOST?.trim() ?? DEFAULT_HOST,
        flushAt: FLUSH_AT,
        flushInterval: FLUSH_INTERVAL_MS,
        ...(options.fetch ? { fetch: options.fetch } : {}),
    });
}

const active = (): PostHog | null => {
    if (!started) initAnalytics();
    return client;
};

export const analyticsEnabled = (): boolean => active() !== null;

/** Who the event is about. `workspaceId` groups it onto the tenant that pays for it. */
export interface EventContext {
    userId: string;
    workspaceId?: string;
    superProps?: Partial<SuperProperties>;
    /**
     * No person behind this event: a public-link viewer has no account. Sets
     * `$process_person_profile`, so a stranger reading a shared deck does not mint a profile we
     * would never query and would still be billed for.
     */
    anonymous?: boolean;
}

export function capture<N extends EventName>(
    ctx: EventContext,
    event: N,
    props: EventProps<N>,
): void {
    const ph = active();
    if (!ph) return;
    ph.capture({
        distinctId: ctx.userId,
        event,
        properties: {
            app_build: build,
            ...(requestScope.getStore() ? { request_id: requestScope.getStore() } : {}),
            // Alongside $groups, not instead of it: groups are a paid add-on, so the flat property
            // is what actually aggregates today.
            ...(ctx.workspaceId ? { workspace_id: ctx.workspaceId } : {}),
            ...ctx.superProps,
            ...props,
            ...(ctx.anonymous ? { $process_person_profile: false } : {}),
        },
        ...(ctx.workspaceId ? { groups: { [GROUP_TYPE]: ctx.workspaceId } } : {}),
    });
}

export function identify(userId: string, traits: Partial<PersonTraits>): void {
    active()?.identify({ distinctId: userId, properties: traits });
}

export function identifyWorkspace(workspaceId: string, traits: Partial<WorkspaceTraits>): void {
    active()?.groupIdentify({ groupType: GROUP_TYPE, groupKey: workspaceId, properties: traits });
}

/** Drain the queue so a deploy does not drop it. Safe to call when nothing was ever configured. */
export async function shutdownAnalytics(): Promise<void> {
    const ph = client;
    client = null;
    started = false;
    if (!ph) return;
    try {
        await ph.shutdown(SHUTDOWN_MS);
    } catch {
        warn("analytics: queue did not drain before shutdown");
    }
}
