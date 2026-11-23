# Shopify test member contribution operations

The test pilot is disabled by default. It does not charge a card or confer
access, billing status, membership, or RG shares. The non-member pass remains
deferred. Do not set either app to a live card mode.

## Setup order

1. Store operator completes the product handoff in the Commerce repository.
   Obtain the exact shop domain, Product GID, and ten nonshipping variant GIDs.
2. Confirm the Shopify test gateway, webhook HMAC, Admin API access, and that
   Commerce's own `COMMERCE_CHECKOUT_MODE=shopify_test`.
3. Configure Commerce's `MEMBER_CONTRIBUTION_MODE=shopify_test`, product GID,
   amount-to-variant mapping, Portal issuer, Participation endpoint, and two
   dedicated service credentials.
4. Configure Participation's `MEMBER_CONTRIBUTION_MODE=shopify_test`, Commerce
   origin/shop domain, and the matching credentials. Never use `NEXT_PUBLIC_`
   for a service credential.
5. Migrate both databases before enabling the flag; start the existing Commerce
   worker, which handles Shopify webhook readback and retryable event delivery.
6. Pilot with an authenticated member whose latest successful Gnosis snapshot
   includes a Portal-verified, non-revoked wallet holding at least 100 RG.

Participation binds authorization to the Portal user, month, amount, wallet,
and membership run; Commerce receives only that server-to-server authorization.
The draft invoice is one-time. A timeout does **not** prove Shopify canceled
the invoice. An unknown create outcome stays held for manual review rather
than creating a second payable invoice.

Any Commerce timeout, rejected or malformed checkout response, review state,
or invoice URL from a shop other than the configured exact
`COMMERCE_SHOP_DOMAIN` persists a terminal Participation `needs_review`
checkout with a safe `error_code`. The dashboard stops polling and tells the
member not to retry or pay again; an operator must reconcile the Commerce and
Shopify records before changing anything. Never clear this by creating a new
authorization for the same month.
An idempotent Commerce `creating` response for that authorization is different:
it means another request is still preparing the invoice. Participation keeps
the authorization `creating`, returns HTTP 202, and the dashboard polls until
the first request publishes the pending invoice or an operator investigates.

## Evidence and safety

- Participation test checkouts/events are in `member_contribution_*`, never
  `payments`, `payment_intents`, `subscriptions`, issuance sources, or metrics.
- Commerce has separate `member_contribution_*` tables and outbox. It must not
  issue a Field Guide PDF, merchandise discount, collectible, or receipt email.
- A browser return URL never confirms a payment. Commerce verifies the Shopify
  webhook HMAC and reads the exact draft/order from Shopify Admin.
- The event inbox accepts only the allowlisted test shop, test environment,
  known authorization and amount. Duplicate events are idempotent; conflicting
  evidence is rejected.
- Monitor Commerce outbox rows in `needs_review` and checkout rows in
  `needs_review`; these require operator investigation. Do not mark a live
  payment confirmed to clear a test exception.
- Participation serializes test event processing per authorization and keeps
  refund/dispute/review states sticky. Commerce claims an outbox row before its
  network call; abandoned claims are retried after a two-minute lease, with
  the receiver's event ID providing idempotency. A retry is not permission to
  create a second invoice or economic event.

Before any live-card phase, separately approve the merchant terms, gross/net
settlement policy, refunds and disputes, persistent cross-rail reservations,
and an issuance validator that recognizes verified *live* card evidence.
