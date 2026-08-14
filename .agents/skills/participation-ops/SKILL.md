---
name: participation-ops
description: Operate and diagnose the RaidGuild participation module, including Railway deployments, OpenAPI discovery, entitlement inspection, Portal or Discord reconciliation dry runs, service-key configuration checks, and safe connector rollout. Use when asked to deploy this module, check its health, inspect a member's derived access, reconcile consumer entitlements, diagnose entitlement drift, or prepare Portal and Discord delivery operations.
---

# Participation Ops

Operate the module conservatively. Treat billing evidence, DAO membership,
derived capabilities, and consumer delivery as separate layers.

## Establish context

1. Read `docs/entitlement-service-api.md` and `.env.example`.
2. Inspect `src/lib/domain/participation.ts` before changing entitlement rules.
3. Inspect the public OpenAPI document instead of guessing endpoint shapes.
4. Confirm the target Railway project, environment, and service before mutation.

Never print, commit, or place service keys in command arguments. Never expose a
server credential through a `NEXT_PUBLIC_` variable.

## Inspect service health

Perform read-only checks first:

```bash
curl --fail --silent --show-error "$PARTICIPATION_BASE_URL/api/health"
curl --fail --silent --show-error "$PARTICIPATION_BASE_URL/.well-known/openapi.json"
```

Confirm that protected endpoints fail closed when the service key is absent or
invalid. A `503` means the server has no configured key; a `401` means the
supplied credential was rejected.

## Reconcile entitlements

1. Resolve the subject by stable Portal user ID.
2. Compare current consumer-managed roles or flags with the capability set.
3. Call reconciliation in `dry_run` mode for `portal`, `discord`, or both.
4. Review every proposed grant and removal.
5. Do not use `apply` until the connector has durable idempotency, scoped
   credentials, delivery logging, and rollback coverage.

Do not infer DAO share issuance from a Discord role. Do not let a consumer
write billing or membership evidence back into this module.

## Deploy to Railway

Use the existing isolated service:

- Project: `91ce093b-1fed-44da-8dc2-ae88e0031d10`
- Environment: `production`
- Service: `portal-participation-module`

Run the full verification suite, then deploy the current folder explicitly:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
railway up . --path-as-root --service portal-participation-module --environment production
```

Require a successful Railway deployment and HTTP smoke checks for `/`,
`/admin`, `/api/health`, and `/.well-known/openapi.json` before reporting
completion. Do not modify another service in the shared Railway project.

## Handle incidents

Prefer disabling a connector or rotating its target-specific credential over
changing entitlement rules during an incident. Preserve dry-run output and
delivery identifiers for review. Roll back only to a known successful
deployment; never broaden access to compensate for a failed sync.
