import "dotenv/config";
import { execFileSync } from "node:child_process";
import Stripe from "stripe";
import type { Interval, PlanId } from "@model/billing";
import { CREDIT_PRICE_USD, PLANS, PLAN_ORDER } from "@model/billing";
import { STRIPE_API_VERSION, WEBHOOK_EVENTS } from "@services/core/billing";

/**
 * Creates (or updates) what Galleo needs in a Stripe account: the products and prices from the
 * catalog in model/billing.ts, the customer portal configuration, and, given the public origin,
 * the webhook endpoint. Prints the env block that wires them up.
 *
 * Safe to re-run and safe against a fresh account: everything is matched by a stable key rather than
 * by name, so a second run finds what the first made instead of duplicating it, and any galleo_
 * price or product the catalog no longer wants is archived so the account converges on the catalog.
 *
 *   pnpm stripe:setup                                the sandbox the CLI is logged into
 *   pnpm stripe:setup --dry-run                      print what would change, touch nothing
 *   pnpm stripe:setup --live --project galleo-live --origin https://galleo.app
 *                                                    the live account, through the CLI profile made
 *                                                    by `stripe login --project-name galleo-live`
 *
 * The key is STRIPE_SECRET_KEY when set, else the Stripe CLI's: its live key only under --live, and
 * a live key only under --live, so a sandbox run can never reach the live account by accident. The
 * webhook signing secret is printed once, on creation; Stripe never shows it again.
 */

const DRY = process.argv.includes("--dry-run");
const LIVE = process.argv.includes("--live");
const flag = (name: string): string | undefined => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const PROJECT = flag("--project");
// the origin the account should point at; APP_URL serves when it is already public
const ORIGIN =
    flag("--origin") ??
    (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : undefined);
const USD = "usd";
const WEBHOOK_PATH = "/api/billing/webhook";
const PORTAL_UPDATES: readonly ("name" | "email" | "address")[] = ["name", "email", "address"];

/** One price we intend to exist. `lookup` is the identity Stripe matches on across runs. */
interface WantedPrice {
    lookup: string;
    envVar: string;
    interval: Interval | null; // null = a one-off price, bought rather than subscribed to
    cents: number;
    product: WantedProduct;
}

/** `id` lands in metadata.galleo_id, which is how a re-run finds the product it made last time. */
interface WantedProduct {
    id: string;
    name: string;
    description: string;
}

const dollars = (n: number): string => `$${n.toFixed(2)}`;
// Stripe bills the whole period, so an annual price is the effective monthly rate times twelve.
const yearly = (monthly: number): number => Math.round(monthly * 12 * 100);

function wanted(): WantedPrice[] {
    const out: WantedPrice[] = [];

    for (const id of PLAN_ORDER) {
        const plan = PLANS[id];
        if (!plan.billing.priceMonthly) continue; // Free is not sold
        const who = plan.account.maxMembers < 0 ? "for the whole team" : "for one person";
        const product: WantedProduct = {
            id: `plan_${id}`,
            name: `Galleo ${plan.name}`,
            description: `${plan.ai.monthlyCredits.toLocaleString()} AI credits a month, ${who}.`,
        };
        const ENV = id.toUpperCase() as Uppercase<PlanId>;
        out.push({
            lookup: `galleo_${id}_month`,
            envVar: `STRIPE_PRICE_${ENV}_MONTH`,
            interval: "month",
            cents: Math.round(plan.billing.priceMonthly * 100),
            product,
        });
        out.push({
            lookup: `galleo_${id}_year`,
            envVar: `STRIPE_PRICE_${ENV}_YEAR`,
            interval: "year",
            cents: yearly(plan.billing.priceAnnualMonthly),
            product,
        });
    }

    // One price for ONE credit, charged by quantity, so every preset is buyable from a single id.
    // A one-off price, not recurring, or Stripe would bill the whole purchase again every month.
    out.push({
        lookup: "galleo_credit",
        envVar: "STRIPE_PRICE_CREDIT",
        interval: null,
        cents: Math.round(CREDIT_PRICE_USD * 100),
        product: {
            id: "credit",
            name: "Galleo AI credit",
            description:
                "One AI credit, bought once. Bought credits join the workspace balance, carry over, and do not expire.",
        },
    });

    return out;
}

/** An explicit env var always wins; otherwise the CLI's key, so a live secret never crosses a shell. */
function secretKey(): string {
    const fromEnv = process.env.STRIPE_SECRET_KEY;
    if (fromEnv) return fromEnv;
    const field = LIVE ? "live_mode_api_key" : "test_mode_api_key";
    const where = PROJECT ? ` for project ${PROJECT}` : "";
    try {
        const args = ["config", "--list", ...(PROJECT ? ["--project-name", PROJECT] : [])];
        const conf = execFileSync("stripe", args, { encoding: "utf8" });
        const key = new RegExp(`^\\s*${field}\\s*=\\s*((?:sk|rk)_\\S+)`, "m").exec(conf)?.[1];
        if (key) {
            log(`• using the Stripe CLI's ${field}${where} (set STRIPE_SECRET_KEY to override)`);
            return key;
        }
    } catch {
        // the CLI is optional; fall through to the error below
    }
    throw new Error(`no STRIPE_SECRET_KEY, and the Stripe CLI has no ${field}${where}`);
}

const log = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

async function ensureProduct(stripe: Stripe, want: WantedProduct): Promise<string> {
    for await (const p of stripe.products.list({ limit: 100, active: true })) {
        if (p.metadata?.galleo_id === want.id) {
            if (p.name !== want.name || p.description !== want.description) {
                log(`  ~ product ${want.id}: updating name/description`);
                if (!DRY)
                    await stripe.products.update(p.id, {
                        name: want.name,
                        description: want.description,
                    });
            }
            return p.id;
        }
    }
    log(`  + product ${want.id} (${want.name})`);
    if (DRY) return `prod_DRYRUN_${want.id}`;
    const created = await stripe.products.create({
        name: want.name,
        description: want.description,
        metadata: { galleo_id: want.id },
    });
    return created.id;
}

/**
 * A Stripe price is immutable, so a changed amount means a new price. `transfer_lookup_key` moves
 * the key across, and the old price is archived so nothing new can attach to it. Existing
 * subscriptions keep billing on the archived price until they are changed, which is the intent:
 * repricing should not silently re-bill anyone.
 */
async function ensurePrice(stripe: Stripe, want: WantedPrice, productId: string): Promise<string> {
    const found = await stripe.prices.list({ lookup_keys: [want.lookup], limit: 1 });
    const existing = found.data[0];
    const matches =
        existing &&
        existing.active &&
        existing.unit_amount === want.cents &&
        existing.currency === USD &&
        (existing.recurring?.interval ?? null) === want.interval &&
        existing.product === productId;
    if (matches) {
        log(
            `  = ${want.lookup.padEnd(24)} ${dollars(want.cents / 100)}${want.interval ? `/${want.interval}` : " once"}`,
        );
        return existing.id;
    }
    if (existing)
        log(
            `  ~ ${want.lookup.padEnd(24)} ${dollars((existing.unit_amount ?? 0) / 100)} → ` +
                `${dollars(want.cents / 100)}${want.interval ? `/${want.interval}` : " once"} (new price, old one archived)`,
        );
    else
        log(
            `  + ${want.lookup.padEnd(24)} ${dollars(want.cents / 100)}${want.interval ? `/${want.interval}` : " once"}`,
        );
    if (DRY) return `price_DRYRUN_${want.lookup}`;

    const created = await stripe.prices.create({
        product: productId,
        currency: USD,
        unit_amount: want.cents,
        ...(want.interval ? { recurring: { interval: want.interval } } : {}),
        lookup_key: want.lookup,
        transfer_lookup_key: !!existing,
    });
    if (existing) await stripe.prices.update(existing.id, { active: false });
    return created.id;
}

/**
 * Archive every active galleo_ price, and then every galleo product, the catalog no longer sells,
 * so a retired shape cannot be bought and does not linger in the dashboard.
 */
async function archiveUnwanted(
    stripe: Stripe,
    keepPrices: ReadonlySet<string>,
    keepProducts: ReadonlySet<string>,
): Promise<void> {
    for await (const p of stripe.prices.list({ limit: 100, active: true })) {
        if (!p.lookup_key?.startsWith("galleo_") || keepPrices.has(p.lookup_key)) continue;
        log(`  - ${p.lookup_key.padEnd(24)} archived (no longer in the catalog)`);
        if (!DRY) await stripe.prices.update(p.id, { active: false });
    }
    for await (const p of stripe.products.list({ limit: 100, active: true })) {
        const id = p.metadata?.galleo_id;
        if (!id || keepProducts.has(id)) continue;
        log(`  - product ${id.padEnd(16)} archived (no longer in the catalog)`);
        if (!DRY) await stripe.products.update(p.id, { active: false });
    }
}

/**
 * One endpoint at the origin's webhook path, subscribed to exactly the events the consumer acts on
 * and pinned to the SDK's API version. Returns the signing secret only on creation: Stripe reveals
 * it once, so an existing endpoint's secret is read in the dashboard.
 */
async function ensureWebhook(stripe: Stripe, origin: string): Promise<string | null> {
    const url = `${origin}${WEBHOOK_PATH}`;
    const events = [...WEBHOOK_EVENTS];
    for await (const w of stripe.webhookEndpoints.list({ limit: 100 })) {
        if (w.url !== url) continue;
        const same =
            w.status === "enabled" &&
            w.enabled_events.length === events.length &&
            events.every((e) => w.enabled_events.includes(e));
        if (same) log(`  = webhook ${url}`);
        else {
            log(`  ~ webhook ${url}: re-subscribing to the consumer's events`);
            if (!DRY)
                await stripe.webhookEndpoints.update(w.id, {
                    enabled_events: events,
                    disabled: false,
                });
        }
        return null;
    }
    log(`  + webhook ${url}`);
    if (DRY) return "whsec_DRYRUN";
    const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: events,
        api_version: STRIPE_API_VERSION,
        description: "Galleo billing",
        metadata: { galleo_id: "billing" },
    });
    return created.secret ?? null;
}

// Money and invoices only: plan changes and cancellation stay in the app, the one path the webhook
// already serves, so the portal cannot become a second way to do the same thing.
function portalWanted(origin: string | undefined): Stripe.BillingPortal.ConfigurationCreateParams {
    return {
        business_profile: origin
            ? { terms_of_service_url: `${origin}/terms`, privacy_policy_url: `${origin}/privacy` }
            : {},
        features: {
            customer_update: { enabled: true, allowed_updates: [...PORTAL_UPDATES] },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: false },
            subscription_update: { enabled: false },
        },
        metadata: { galleo_id: "portal" },
    };
}

/** The portal configuration the server names in STRIPE_PORTAL_CONFIG, found by its galleo_id. */
async function ensurePortal(stripe: Stripe, origin: string | undefined): Promise<string> {
    const want = portalWanted(origin);
    for await (const c of stripe.billingPortal.configurations.list({ limit: 100, active: true })) {
        if (c.metadata?.galleo_id !== "portal") continue;
        const f = c.features;
        const have = f.customer_update.allowed_updates;
        const same =
            f.customer_update.enabled &&
            have.length === PORTAL_UPDATES.length &&
            PORTAL_UPDATES.every((u) => have.includes(u)) &&
            f.invoice_history.enabled &&
            f.payment_method_update.enabled &&
            !f.subscription_cancel.enabled &&
            !f.subscription_update.enabled &&
            (!origin ||
                (c.business_profile.terms_of_service_url ===
                    want.business_profile?.terms_of_service_url &&
                    c.business_profile.privacy_policy_url ===
                        want.business_profile?.privacy_policy_url));
        if (same) log(`  = portal ${c.id}`);
        else {
            log(`  ~ portal ${c.id}: updating features`);
            if (!DRY) await stripe.billingPortal.configurations.update(c.id, want);
        }
        return c.id;
    }
    log("  + portal configuration");
    if (DRY) return "bpc_DRYRUN";
    return (await stripe.billingPortal.configurations.create(want)).id;
}

async function main(): Promise<void> {
    const key = secretKey(); // resolved once: the CLI fallback logs which source it used
    const live = /^(sk|rk)_live_/.test(key);
    if (live && !LIVE) throw new Error("that is a live key: pass --live to touch the live account");
    if (LIVE && !live) throw new Error("--live was passed, but the key is a test key");
    const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    log(`Stripe: ${live ? "LIVE" : "test"} mode`);
    if (DRY) log("dry run: nothing will be written\n");
    else log("");

    const env: string[] = [];
    const byProduct = new Map<string, string>();
    const wants = wanted();
    for (const want of wants) {
        let productId = byProduct.get(want.product.id);
        if (!productId) {
            productId = await ensureProduct(stripe, want.product);
            byProduct.set(want.product.id, productId);
        }
        env.push(`${want.envVar}=${await ensurePrice(stripe, want, productId)}`);
    }
    await archiveUnwanted(stripe, new Set(wants.map((w) => w.lookup)), new Set(byProduct.keys()));
    env.push(`STRIPE_PORTAL_CONFIG=${await ensurePortal(stripe, ORIGIN)}`);
    if (ORIGIN) {
        const secret = await ensureWebhook(stripe, ORIGIN);
        env.push(
            secret
                ? `STRIPE_WEBHOOK_SECRET=${secret}`
                : "STRIPE_WEBHOOK_SECRET=(unchanged; reveal it under Developers → Webhooks if it is not set yet)",
        );
    }

    log(`\n${DRY ? "Would write" : "Set"} these in .env and in Render:\n`);
    log(env.join("\n"));
    const still = [
        "  STRIPE_SECRET_KEY      this account's key; on live, a restricted key with Checkout Sessions,",
        "                         Customers, Subscriptions and Customer portal set to write",
    ];
    if (!ORIGIN)
        still.push(
            "  STRIPE_WEBHOOK_SECRET  pass --origin https://<host> to register the endpoint here, or use",
            "                         `stripe listen --forward-to localhost:8601" +
                WEBHOOK_PATH +
                "` locally",
        );
    log(`\nStill needed:\n${still.join("\n")}`);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
