import "dotenv/config";
import { execFileSync } from "node:child_process";
import Stripe from "stripe";
import type { Interval, PlanId } from "@model/billing";
import { CREDIT_PRICE_USD, PLANS, PLAN_ORDER } from "@model/billing";

/**
 * Creates (or updates) the Stripe products and prices Galleo sells, from the catalog in
 * model/billing.ts, and prints the env block that wires them up.
 *
 * Safe to re-run and safe against a fresh account: everything is matched by a stable key rather than
 * by name, so a second run finds what the first made instead of duplicating it, and any galleo_
 * price the catalog no longer wants is archived so the account converges on the catalog. Point it
 * at another account by exporting that account's STRIPE_SECRET_KEY.
 *
 *   pnpm stripe:setup              apply
 *   pnpm stripe:setup --dry-run    print what would change, touch nothing
 *
 * Out of scope, because neither is derivable from the catalog: the webhook signing secret
 * (STRIPE_WEBHOOK_SECRET, from the endpoint you register) and the customer portal configuration
 * (STRIPE_PORTAL_CONFIG).
 */

const DRY = process.argv.includes("--dry-run");
const USD = "usd";

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

    // every plan price is per seat and the subscription's quantity is the seat count
    for (const id of PLAN_ORDER) {
        const plan = PLANS[id];
        if (!plan.billing.priceMonthly) continue; // Free is not sold
        const seats =
            plan.billing.maxSeats > 1
                ? `per seat, ${plan.billing.minSeats} seats minimum`
                : "one seat";
        const product: WantedProduct = {
            id: `plan_${id}`,
            name: `Galleo ${plan.name}`,
            description: `${plan.ai.creditsPerSeat.toLocaleString()} AI credits a month, ${seats}.`,
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

/** The CLI's key is a convenience for the sandbox; an explicit env var always wins. */
function secretKey(): string {
    const fromEnv = process.env.STRIPE_SECRET_KEY;
    if (fromEnv) return fromEnv;
    try {
        const conf = execFileSync("stripe", ["config", "--list"], { encoding: "utf8" });
        const key = /^\s*test_mode_api_key\s*=\s*(sk_\S+)/m.exec(conf)?.[1];
        if (key) {
            log("• using the Stripe CLI's configured test key (set STRIPE_SECRET_KEY to override)");
            return key;
        }
    } catch {
        // the CLI is optional; fall through to the error below
    }
    throw new Error("no STRIPE_SECRET_KEY, and the Stripe CLI has no configured key");
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

/** Archive every active galleo_ price the catalog no longer sells, so a retired shape cannot be bought. */
async function archiveUnwanted(stripe: Stripe, keep: ReadonlySet<string>): Promise<void> {
    for await (const p of stripe.prices.list({ limit: 100, active: true })) {
        if (!p.lookup_key?.startsWith("galleo_") || keep.has(p.lookup_key)) continue;
        log(`  - ${p.lookup_key.padEnd(24)} archived (no longer in the catalog)`);
        if (!DRY) await stripe.prices.update(p.id, { active: false });
    }
}

async function main(): Promise<void> {
    const key = secretKey(); // resolved once: the CLI fallback logs which source it used
    const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
    const mode = key.startsWith("sk_live") ? "LIVE" : "test";
    log(`Stripe: ${mode} mode`);
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
    await archiveUnwanted(stripe, new Set(wants.map((w) => w.lookup)));

    log(`\n${DRY ? "Would write" : "Set"} these in .env and in Render:\n`);
    log(env.join("\n"));
    log(
        "\nStill needed, and not derivable from the catalog:\n" +
            "  STRIPE_SECRET_KEY      this account's secret key\n" +
            "  STRIPE_WEBHOOK_SECRET  from the endpoint you register at /api/billing/webhook\n" +
            "  STRIPE_PORTAL_CONFIG   optional; a customer portal configuration id",
    );
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
