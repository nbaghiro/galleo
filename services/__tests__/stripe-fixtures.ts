import type Stripe from "stripe";

// Real Stripe SDK objects for tests that spy on the live client, where a partial stand-in does not
// typecheck. Every field the SDK declares is filled, so these stay assertion-free.

const UNIT_AMOUNT = 100; // cents per unit; nothing under test reads an amount, only the quantity

export function stripePrice(id: string): Stripe.Price {
    return {
        id,
        object: "price",
        active: true,
        billing_scheme: "per_unit",
        created: 0,
        currency: "usd",
        custom_unit_amount: null,
        livemode: false,
        lookup_key: null,
        metadata: {},
        nickname: null,
        product: "prod_fixture",
        recurring: null,
        tax_behavior: null,
        tiers_mode: null,
        transform_quantity: null,
        type: "one_time",
        unit_amount: UNIT_AMOUNT,
        unit_amount_decimal: null, // `Decimal` is branded, so a literal cannot stand in for one
    };
}

/**
 * What `checkout.sessions.listLineItems` resolves to. The SDK hands every resource back wrapped in
 * the response it arrived on, so a value missing `lastResponse` is not the method's return type.
 */
export function stripeLineItems(
    lines: { priceId: string; quantity: number }[],
    sessionId = "cs_fixture",
): Stripe.Response<Stripe.ApiList<Stripe.LineItem>> {
    return {
        object: "list",
        has_more: false,
        url: `/v1/checkout/sessions/${sessionId}/line_items`,
        data: lines.map((line, i): Stripe.LineItem => {
            const amount = UNIT_AMOUNT * line.quantity;
            return {
                id: `li_${i}`,
                object: "item",
                adjustable_quantity: null,
                amount_discount: 0,
                amount_subtotal: amount,
                amount_tax: 0,
                amount_total: amount,
                currency: "usd",
                description: null,
                metadata: null,
                price: stripePrice(line.priceId),
                quantity: line.quantity,
            };
        }),
        lastResponse: { headers: {}, requestId: "req_fixture", statusCode: 200 },
    };
}
