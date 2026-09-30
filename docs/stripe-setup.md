# Stripe Adapter Evaluation Notes

> Deferred. RaidGuild is launching with manual wxDAI payments. Card support is
> a future option, remains provider-neutral, and requires entity and acceptable-use
> approval before this evaluation proceeds. See
> [Payment Provider Integration](./payment-provider-integration.md).

## Can we build and test before connecting the bank?

Yes. The current app has a local deterministic mock and needs no Stripe account.
A later integration step can use a Stripe sandbox/test mode with test cards,
test subscriptions, signed test webhooks, and test clocks. A real bank account
is only needed when RaidGuild is ready to receive live Stripe payouts.

No real charges, payouts, or bank movements occur in Stripe test mode.

## What is needed now

Nothing financial is required for the current mock. Product owners should decide:

- the Stripe account/business that will ultimately be the merchant of record;
- whether customers are charged in USD;
- whether to approve member amounts (`$20` through `$200`);
- whether amounts are fixed increments or any value in the range;
- billing date behavior (signup anniversary or a common monthly date);
- cancellation timing;
- the past-due grace period;
- refund and chargeback policy; and
- whether Stripe fees are a DAO expense or reduce share eligibility.

The UI uses fixed `$20` increments and previews a proposed member issuance rate of
$2.50 per RG—a 50% discount from the reference $5 RG price. DAO approval, currency conversion,
and payment-processing fee treatment remain policy decisions.

## What is needed for Stripe sandbox integration

An authorized RaidGuild operator should create or grant access to the intended
Stripe account, then provide these through a secure secret manager—not chat,
email, source control, or CMS fields:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

A publishable test key is only needed if the browser uses Stripe.js or embedded
components. A server-created hosted Checkout redirect may not need it initially:

```text
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

We will also need sandbox Product and recurring Price IDs. Recommended product
catalog:

```text
Optional Member Contribution (future recurring variant)
  monthly prices: $20, $40, $60, $80, $100,
                  $120, $140, $160, $180, $200

```

The app would map an approved server-side member plan key and amount to these IDs. It would
not trust a Price ID or arbitrary amount submitted by the browser.

We also configure a Stripe Billing Portal sandbox so users can update payment
methods, view invoices, cancel at period end, and reactivate when policy allows.

## Webhook destination

The deployed preview needs an HTTPS endpoint such as:

```text
POST https://participation-preview.example.org/api/stripe/webhook
```

During local development, the Stripe CLI can forward sandbox events to the
local endpoint. The webhook signing secret from that forwarding session is a
development secret and is different from the deployed endpoint secret.

At minimum, the integration should process:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Handlers store event IDs for idempotency, verify signatures against the raw
request body, and tolerate duplicate and out-of-order delivery.

## Testing before live mode

The sandbox validation suite should cover:

- successful member signup and rejection of cohort checkout attempts;
- rejection when the selected plan does not match the Portal credential;
- monthly member amount changes;
- successful renewal;
- failed renewal and past-due grace behavior;
- payment method recovery;
- cancellation at period end;
- reactivation before period end;
- refund and dispute accounting behavior;
- duplicate and out-of-order webhooks; and
- month-end share issuance cutoff behavior.

Stripe test clocks can advance sandbox subscriptions through renewals and state
changes without waiting for real calendar months.

## What is needed before accepting live payments

Live activation is a separate milestone. RaidGuild will need to complete the
Stripe account's business verification and provide payout details required for
its jurisdiction. An authorized finance operator—not the application developer—
should add and verify the bank account in Stripe's payout settings.

Before switching keys from test to live:

- approve customer-facing terms, privacy notice, refund policy, and statement
  descriptor;
- secure DAO approval for any USD/wxDAI conversion and RG issuance policy;
- configure tax handling with appropriate professional advice;
- configure live Products and Prices;
- configure and test the live Billing Portal;
- register the live webhook destination and store its separate signing secret;
- verify notification and support paths for payment failures;
- perform a small real-payment and refund test; and
- document reconciliation from Stripe payout to bank and bank to onchain
  treasury.

Connecting a bank account does not transfer subscription proceeds directly to
the onchain treasury. Stripe pays out to the verified bank account. RaidGuild's
finance workflow then reconciles those payouts and separately transfers funds
to the DAO Safe before the monthly `mintShares` proposal.

## References

- [Stripe subscription integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Stripe Billing testing](https://docs.stripe.com/billing/testing)
- [Stripe test clocks](https://docs.stripe.com/billing/testing/test-clocks)
- [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Stripe payouts and bank setup](https://docs.stripe.com/payouts)
