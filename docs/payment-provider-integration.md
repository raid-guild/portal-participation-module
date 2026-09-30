# Payment Provider Integration

## Decision

The current payment rail is an optional manual monthly wxDAI transfer from
RaidGuild members directly to the treasury Safe. Cohort participation and
graduate recognition are free. Card payments and automatic renewal are future
options requiring separate policy and provider decisions.

The provider-neutral recurring-fiat contract stays in the codebase as a future
extension point, but it is not enabled in launch configuration. Production
creates expiring payment intents and independently verifies submitted Gnosis
transactions. Mock controls and routes remain available only in explicit local
mock mode.

## Application contract

Every adapter implements the same rail-aware operations:

```ts
interface PaymentAdapter {
  providerName: string
  rail: 'fiat_recurring' | 'stablecoin_direct'
  capabilities: PaymentAdapterCapabilities
  createPaymentSession(request): Promise<PaymentSession>
  createCustomerPortalSession(request): Promise<CustomerPortalSession | null>
  parseNotification(request): Promise<PaymentEvent>
  reconcilePayment(providerReference): Promise<PaymentEvent | null>
}
```

The provider is responsible for:

- producing either a hosted checkout redirect or exact onchain instructions;
- recurring billing when the rail supports it;
- customer payment-method and cancellation management when supported;
- notification authenticity or onchain confirmation verification; and
- translation from provider events into normalized application events.

The application is responsible for:

- allowing new payment intents only for verified members;
- mapping internal plan keys to provider configuration;
- payment records and derived entitlements, while free cohort access stays
  independent of billing;
- webhook idempotency and ordering;
- the past-due grace policy;
- share eligibility and reconciliation; and
- monthly DAO proposal preparation.

## Internal plan keys

Provider product or price IDs never appear in browser input or domain logic.
The application uses stable keys:

```text
member_share_20
member_share_40
...
member_share_200
```

`cohort_grad_20` and `cohort_participant_20` remain typed only for historical
records and existing intent confirmation. New intents reject both keys. A
future provider would map active member keys through server-side configuration.

## Normalized payment events

Adapters translate vendor-specific events into:

```text
checkout.completed
subscription.created
subscription.updated
subscription.deleted
invoice.paid
invoice.failed
payment.confirmed
payment.expired
payment.refunded
```

Each event includes an opaque provider event reference, creation time, provider
name, and a normalized subscription when applicable. The application stores the
event reference and rejects duplicate processing.

## Future rail: recurring fiat processor

A suitable Paddle/Stripe-class adapter should support:

- monthly recurring USD payments;
- hosted checkout so this app does not handle card data;
- customer self-service for payment methods, invoices, and cancellation;
- cryptographically verifiable webhooks;
- sandbox/test transactions;
- refunds and dispute visibility;
- exports or APIs suitable for monthly reconciliation; and
- payouts to RaidGuild's approved financial account.

Useful but optional capabilities:

- controllable billing-cycle anchors;
- subscription simulation or test clocks;
- automatic tax tooling;
- non-card payment methods; and
- flexible recurring amounts.

If a provider lacks a self-service portal, its adapter can return an app-owned
billing-management URL, but that substantially increases implementation scope.

## Launch rail: wxDAI direct to treasury

Initial configuration:

```text
Network: Gnosis Chain (chain ID 100)
Token: wxDAI, 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
Recipient: RaidGuild Safe, 0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC
```

The app creates a time-limited payment intent containing the expected payer
wallet, exact token, exact amount, recipient, chain, and participation period.
The wallet sends wxDAI directly to the Safe. The app never takes custody.

A direct ERC-20 transfer has no reliable human-readable memo. Confirmation must
match all of:

```text
chain ID
token contract
treasury recipient
expected payer wallet
exact amount
unused transaction hash
transaction success
minimum confirmation count
payment-intent validity window
```

The payer supplies or the connected wallet returns the transaction hash. The
server independently verifies it through a trusted Gnosis RPC/indexer. A browser
claim that payment succeeded is never enough.

Direct wxDAI is an optional manual member contribution for one monthly period.
It is not an automatically renewing subscription. The dashboard shows whether
the current month is confirmed. Automatic token pulls, unlimited allowances,
streaming protocols, and a payment-router contract are deferred.

Direct-to-Safe matching has an edge case when the same wallet sends the same
amount more than once. Each transaction hash can be consumed once, and admins
must review duplicates/refunds rather than letting the system guess. If scale
makes reconciliation unreliable, a small payment-router contract that emits a
Portal payment-intent ID could improve attribution while forwarding funds to
the Safe—but that would no longer be a literal direct transfer.

The first version should accept wxDAI only. Native xDAI and additional
stablecoins introduce separate token, decimal, pricing, and treasury-accounting
rules and should be added deliberately.

## Mock adapter

The mock implementation accepts no money and creates no external customer. The
primary experience previews direct wxDAI instructions. The card route explains
the planned experience but does not simulate an available payment method. Mock
controls must be disabled outside explicit mock mode.

The mock should exercise:

- eligible and ineligible plan selection;
- successful member payment confirmation;
- historical payment states without restricting free cohort access;
- cancellation at period end;
- duplicate and out-of-order events; and
- member-only estimated share eligibility, subject to DAO approval;
- wrong chain, token, sender, recipient, or amount; and
- reused or insufficiently confirmed transaction hashes.

## What RaidGuild must decide before selecting a provider

- merchant-of-record entity;
- charge currency;
- approved member contribution increments;
- billing date behavior;
- cancellation and past-due grace rules;
- refunds and chargebacks;
- fee treatment in share calculations;
- tax obligations and tooling; and
- payout-to-bank-to-treasury reconciliation ownership.

No bank account is needed for the mock. Bank or payout details should only be
provided directly to the selected processor by an authorized finance operator
when live activation is approved.

## Adding a live adapter

1. Confirm the provider meets the required capability list.
2. Add a server-only adapter implementing `PaymentAdapter`.
3. Add namespaced environment configuration.
4. Map internal plan keys to provider product/price references.
5. Add signature-verification and event-normalization tests.
6. Run the full subscription lifecycle in the provider sandbox.
7. Verify that no provider SDK type leaks into domain, entitlement, or UI code.
8. Complete live business verification and payout setup as a separate milestone.

Provider-specific operational notes may live in separate appendices. They must
not redefine the application contract.
