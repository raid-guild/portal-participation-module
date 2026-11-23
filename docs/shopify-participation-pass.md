# Shopify Participation Pass

## Status

Proposed pilot architecture. This document defines how the RaidGuild Commerce
app could accept card payments through Shopify without making Shopify or
Commerce authoritative for Portal identity, DAO membership, entitlements, or
share issuance.

The pilot should use one-time monthly purchases. Automatic renewal is deferred
until the one-time flow, merchant approval, accounting policy, refunds, and
cross-rail limits have been proven in production.

## Product decision

Two offerings may eventually share the same payment infrastructure, but they
must remain distinct products with honest descriptions:

1. **Participation pass** — pays for a defined period of participation access
   or services. It does not confer DAO membership or RG shares.
2. **Member contribution** — an optional $20–$200 monthly contribution by a
   canonical RaidGuild member. It may appear in the reviewed discounted-share
   report, subject to DAO policy and proposal approval.

The first implementation must not silently re-paywall capabilities that are
currently free for cohort participants or graduates. RaidGuild must approve the
participation-pass benefits before that product can affect access.

Payment does not make a buyer a RaidGuild member. A member contribution is
eligible for the share-review workflow only when the buyer's Portal-verified
wallet has at least 100 RG in the applicable Gnosis membership snapshot.

## System boundary

```text
Portal-authenticated user
          |
          v
Participation checkout authorization
          |
          v
Commerce -> Shopify checkout
          |
          v
Verified capture/readback
          |
          v
Commerce transactional outbox
          |
          v
Participation billing inbox
          |
          v
Derived access and/or admin share-review report
```

- **Portal** supplies the canonical user identity and verified wallet.
- **Gnosis Chain** supplies canonical DAO membership evidence.
- **Commerce** owns Shopify credentials, checkout, payment verification,
  refunds, and delivery retries.
- **Participation** owns payment-period policy, the shared monthly limit,
  capability derivation, and the reviewed share estimate.
- **DAO governance** owns sponsorship, voting, execution, and any share mint.

The browser return URL is display-only. It must never grant access or mark a
payment confirmed.

## Pilot purchase flow

1. The buyer enters Participation through the signed Portal handoff.
2. Participation determines the buyer's canonical Portal identity and current
   membership evidence.
3. Participation reserves an amount for the UTC calendar month and creates a
   short-lived, single-use checkout authorization. The authorization binds the
   Portal subject, offering, exact amount, currency, period, environment, and a
   correlation ID.
4. Participation sends the authorization to Commerce server-to-server.
5. Commerce validates the authorization and creates the allowlisted Shopify
   draft-order checkout. It must not trust a browser-supplied user, product,
   price, period, or wallet.
6. Shopify collects the card payment. Commerce verifies the raw webhook HMAC
   and performs an authoritative Admin API readback before accepting a
   successful non-manual capture.
7. Commerce stores the verified economic event and a Participation delivery in
   the same database transaction. A durable worker retries delivery.
8. Participation deduplicates the event, validates it against the original
   authorization, records immutable billing evidence, and derives the result.
9. The user sees payment, period, refund, and reconciliation status. Eligible
   member contributions may appear in the monthly admin report; they never
   trigger an automatic mint.

For the first release, require Portal authentication and disallow guest
purchases, gifting, and changing the recipient after checkout creation.
Shopify email is receipt data, not an identity key.

## Shared monthly limit

Member contributions have one allowance across every payment rail, not a
separate allowance per provider:

```text
confirmed card contributions
+ confirmed wxDAI contributions
+ active checkout reservations
- released reservations and approved refunds
<= 200 USD-equivalent for the UTC calendar month
```

The reservation and final confirmation checks must run inside PostgreSQL
transactions. This prevents concurrent card and wxDAI checkouts from accepting
more than the approved maximum. A card authorization must use USD integer minor
units; wxDAI continues to use token integer units. The approved policy must
define whether their values are treated as exactly equivalent or use a recorded
conversion rule.

An over-limit or mismatched event enters admin review. It awards no proposed
shares and must not be silently assigned to a later month.

## Service contract

Participation should expose a dedicated versioned endpoint such as:

```text
POST /api/v1/billing/events
```

The Commerce worker uses a separate server-only credential limited to
`billing:write`. It must not receive the entitlement reconciliation, metrics,
admin, Portal, or Discord keys.

A normalized event contains:

```text
schemaVersion
eventId
eventType: payment.confirmed | payment.refunded | payment.disputed
occurredAt
source: raidguild-commerce
environment: test | live
shopDomain
checkoutAuthorizationId
commerceCheckoutId
portalIssuer
portalUserId
offeringKey
periodKey
currency
productSubtotalMinor
taxMinor
refundedSubtotalMinor
shopifyOrderId
shopifyLineItemId
shopifyTransactionId or shopifyRefundId
verifiedAt
```

Use stable Shopify economic identifiers for idempotency, not webhook delivery
IDs alone. Duplicate events return the previously stored result. Reusing an ID
with different data, unknown users or products, amount mismatches, and test
events sent to the live endpoint must fail closed and produce an audited review
exception.

Commerce sends payment evidence, never a capability, membership assertion,
wallet, proposed share quantity, or DAO instruction. Participation derives all
of those from its own policy and canonical evidence.

## Payment and settlement states

The UI and admin report must distinguish:

- checkout created;
- Shopify payment captured;
- refunded or disputed;
- Commerce event delivered;
- merchant reconciliation completed;
- funds settled or transferred to RaidGuild; and
- included in, excluded from, or awaiting a DAO share proposal.

A successful Shopify capture is not proof that funds reached the DAO treasury.
The current Commerce operating model describes Odyssy as the Shopify merchant
that later settles contractual proceeds to RaidGuild. Before live launch,
RaidGuild must confirm the seller of record, supported offering, tax and refund
terms, payout path, and whether the share estimate uses gross payment or net
settled proceeds.

## Refunds and disputes

- A refund or dispute before the monthly issuance period is frozen removes the
  affected amount from the share-review batch and may revoke a time-limited
  pass according to the approved access policy.
- An event received out of order must not resurrect paid access. A later replay
  of the original capture remains superseded by the refund or dispute.
- If shares have already been issued, the system creates an audited governance
  exception. It must never auto-burn shares or debit a future period without an
  explicit approved policy.
- Partial refunds reduce only the eligible product subtotal. Taxes, unrelated
  line items, and processor fees must remain separately represented.

## Pilot checklist

### Policy and merchant readiness

- [ ] Approve whether the first product is a participation pass, a member
  contribution, or two separate offerings.
- [ ] Define the access capabilities and duration of a participation pass.
- [ ] Confirm that existing free cohort and graduate capabilities remain free
  or approve an explicit policy change.
- [ ] Approve gross-versus-net share treatment and settlement timing.
- [ ] Approve refund, dispute, and post-issuance exception handling.
- [ ] Confirm the Shopify merchant, live card eligibility, seller-of-record,
  payout, tax, and customer-support responsibilities.

### Integration

- [ ] Add a one-time card payment rail distinct from recurring fiat billing.
- [ ] Add PostgreSQL checkout reservations and atomic cross-rail cap checks.
- [ ] Publish the checkout-authorization and billing-event OpenAPI contracts.
- [ ] Add a dedicated Commerce `billing:write` service credential.
- [ ] Generalize Commerce's paid digital checkout into an allowlisted
  participation offering without weakening its payment verification.
- [ ] Add a transactional Commerce outbox and idempotent Participation inbox.
- [ ] Display capture, refund, reconciliation, and settlement status separately.

### Test-mode acceptance

- [ ] Complete a valid Shopify test purchase and full refund.
- [ ] Test failed and manual payments, duplicate delivery, missed webhook
  polling, worker retry, partial refund, dispute, and out-of-order delivery.
- [ ] Reject wrong user, product, amount, period, shop, and environment.
- [ ] Test concurrent card and wxDAI attempts at the monthly maximum.
- [ ] Confirm test payments cannot appear in live access or issuance reports.
- [ ] Confirm no payment path can directly mint or submit a share proposal.

### Controlled live pilot

- [ ] Enable one allowlisted offering for a small Portal-authenticated group.
- [ ] Reconcile Shopify capture, merchant settlement, RaidGuild receipt, and the
  Participation admin report for each pilot purchase.
- [ ] Review all refunds, disputes, and exceptions before freezing a monthly
  issuance report.
- [ ] Add automatic renewal only after the one-time monthly pilot succeeds and
  the supported Shopify subscription lifecycle is separately designed.
