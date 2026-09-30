# RaidGuild Participation Module

Standalone Next.js module for free cohort participation, optional member
contributions, participation signals, and monthly RG share proposal review.

The current implementation combines a live signed Portal authentication handoff,
durable PostgreSQL state, canonical Gnosis membership snapshots, and manual
monthly member wxDAI contributions directly to the RaidGuild treasury. Cohort
participation and graduate recognition do not require payment. Card payments remain
a possible future rail. The app can prepare issuance review data but
has no wallet key, Shaman permission, or RaidGuild DAO mint authority.

The discounted member share rate is a proposal for DAO approval, not an approved
issuance promise. Any shares require a reconciled manual batch, a DAO proposal,
approval, and onchain execution. Member email, personal sites, and an RG AI
assistant are ideas under review and are not provided by this module.

## Run locally

```bash
corepack pnpm install
corepack pnpm dev
```

Set `NEXT_PUBLIC_APP_MODE=mock`, then open `http://localhost:3000` to use the
prototype controls and preview member, cohort graduate, participant, active,
past-due, and canceled states.

The app-admin preview is at `http://localhost:3000/admin` and requires an
explicit `participation_app_admin` assignment when Portal auth is configured.

API discovery is available at `http://localhost:3000/.well-known/openapi.json`.
The entitlement endpoints fail closed until `ENTITLEMENTS_SERVICE_KEY` is
configured. Reconciliation supports safe dry runs; apply delivery to Portal
and Discord is intentionally not wired yet.

## Verify

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Documentation

- [Product spec](./docs/participation-dashboard-product-spec.md)
- [Next.js technical spec](./docs/nextjs-module-technical-spec.md)
- [Payment provider integration](./docs/payment-provider-integration.md)
- [Entitlement service API](./docs/entitlement-service-api.md)
- [Offchain subscription and batch mint workflow](./docs/stripe-batch-mint.md)
- [Possible onchain Shaman](./docs/onchain-subscription-shaman.md)
- [Future feature checklist](./docs/future-feature-checklist.md)
