# Entitlement service API

The participation module is the source of normalized participation
entitlements. Portal and Discord should consume capabilities from this API
instead of independently interpreting billing events or DAO membership.

## Discovery and authentication

- OpenAPI 3.1 discovery: `GET /.well-known/openapi.json`
- Equivalent API route: `GET /api/openapi`
- Health check: `GET /api/health`
- Protected routes use `Authorization: Bearer <service key>`.
- The key is server-only in `ENTITLEMENTS_SERVICE_KEY`; it must never use a
  `NEXT_PUBLIC_` name or be sent to a browser.

If no service key is configured, protected endpoints fail closed with `503`.
An invalid or missing key returns `401`.

## Initial endpoints

`GET /api/v1/entitlements/{portalUserId}` returns a versioned snapshot from the
subject, participation class, normalized billing status, source credentials,
and derived capabilities. DAO member status is canonical only when the latest
successful Gnosis snapshot marks a Portal-verified wallet as holding at least
100 RG.

`POST /api/v1/entitlements/reconcile` accepts a Portal user ID, one or both
targets (`portal`, `discord`), and a mode. `dry_run` returns the planned
replace-capabilities operations without contacting a consumer. `apply`
currently returns `501` until authenticated Portal and Discord connectors are
implemented.

## Canonical DAO membership operations

Member share eligibility is derived from the Portal-verified Gnosis wallet, not
from a Portal credential or Discord role. An app admin can refresh the snapshot
from the admin page. Each run verifies the Baal `sharesToken()` address and
stores every balance against one confirmed block number and hash. The threshold
is 100 RG shares. Failed runs are retained and never replace the latest
successful report source.

The monthly admin CSV joins that snapshot to confirmed payment records. It is a
review artifact only and has no contract key or mint permission. For an initial
or emergency server-side refresh, run `pnpm dao:refresh -- ops:<operator>`.
App-admin bootstrap is explicit: after the operator has launched the module once,
run `pnpm admin:grant -- <portal-user-id> <assigned-by>`.

## Integration direction

Start with pull-based reads from Portal and a manually invoked dry-run. Add a
small outbox and idempotent delivery worker before enabling `apply`. Each
consumer connector should:

1. map stable capability identifiers to its local roles or feature flags;
2. replace managed entitlements rather than append indefinitely;
3. ignore capabilities it does not recognize;
4. record the snapshot version and delivery result; and
5. retry idempotently without granting broader access.

For Discord, a bot or narrowly scoped service account should manage only the
roles owned by this module. For Portal, prefer a server-to-server endpoint with
a separate credential and an allowlist of writable entitlement fields.

## Current prototype limits

The service has a durable PostgreSQL schema for Portal-linked users, verified
wallets, billing evidence, payments, reproducible DAO membership snapshots,
issuance review, audit history, and an entitlement-delivery outbox. Stablecoin
payment ingestion and Portal and Discord apply connectors are not implemented,
so confirmed payments still require the pilot operations path and consumer
delivery remains dry-run only.
