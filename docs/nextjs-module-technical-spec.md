# Next.js Participation Module Technical Spec

## Status

Historical implementation baseline for the standalone Participation Dashboard.
The module now has live Portal auth and manual wxDAI member payment support.
Sections below that describe paid cohort plans, required cohort subscriptions,
or a settled share price are superseded: cohort participation and graduate
recognition are free; member contributions are optional; discounted share
issuance remains a proposal pending DAO approval.

## Runtime and repository

- Next.js 16 App Router
- React 19
- TypeScript with strict mode
- Server Components by default
- Client Components only for interactive mock controls and future forms
- Plain CSS using Louchi semantic tokens for the initial small component set
- Vitest for domain rules
- pnpm for dependency management

The app is deployed separately from `rg-portal`. Portal launches it as an
external module through the existing signed-launch endpoint.

## Routes

```text
/                         participation dashboard
/admin                    app-admin operations preview
/portal/callback          signed Portal launch receiver
/portal/logout            revoke the current module-local session
/api/session              inspect the current browser session
/api/payments/session     create redirect or onchain payment instructions
/api/payments/portal      provider-neutral customer billing portal
/api/payments/notify      provider webhook normalization endpoint
/api/payments/confirm     reconcile an onchain payment intent/transaction
```

The mock slice exposes persona and billing-state controls on the dashboard. They
are presentation fixtures, not authentication or authorization mechanisms, and
must be disabled outside explicit mock mode.

## Layers

```text
app/                routes and route-level composition
components/         reusable UI and dashboard sections
lib/domain/         pure credentials, billing, entitlement, share calculations
lib/mock/           deterministic people, subscriptions, issuance, metrics
lib/portal/         launch-token verification and local-session handoff
lib/payments/       provider contract, plan catalog, and adapters
```

Entitlement and share calculations live outside React so they can be tested and
reused by route handlers, background jobs, and issuance exports.

## Identity contract

Expected Portal launch claims:

```ts
type PortalLaunchClaims = {
  typ: 'portal_module_launch'
  iss: string
  aud: string
  sub: string
  userID: string | number
  profileID?: string | number
  email?: string
  name?: string
  handle?: string
  picture?: string
  roles?: string[]
  credentials?: Array<
    'raidguild_member' | 'cohort_grad' | 'cohort_participant'
  >
  moduleSlug: string
  scopes: string[]
  iat: number
  exp: number
}
```

The callback must validate HS256 signature, issuer, audience, type, module slug,
and expiration. It then upserts a local user by `userID`, creates an HTTP-only
same-site session, and redirects to `/`. The raw launch JWT is never logged or
stored.

## Authorization

Access decisions use pure derived capabilities. UI visibility is not security.
Every future server action and route handler checks the same server-side
capability function.

`participation_app_admin` is local and explicitly assigned. It is never inferred
from Portal `admin`, RaidGuild membership, or payment-provider state.

## Payment provider boundary

The application depends on a `PaymentAdapter`, not a vendor SDK. Multiple
adapters can be enabled concurrently. The
contract owns these operations:

- create a hosted checkout redirect or exact onchain transfer instruction;
- create a customer self-service portal session when supported;
- verify and normalize provider notifications; and
- reconcile an onchain transaction when the rail requires polling.

Normalized application events are:

```text
checkout.completed
subscription.created
subscription.updated
subscription.deleted
invoice.paid
invoice.failed
```

Provider SDK objects and event names must not cross the adapter boundary. The
application stores its own plan keys, billing states, customer references, and
subscription references. Provider references remain opaque strings.

The launch rail is live Gnosis wxDAI direct to the RaidGuild Safe. The
recurring fiat adapter remains a disabled future boundary. Each adapter
implements the same contract and declares capabilities such as automatic
renewal, hosted checkout, customer portal, and direct-to-treasury settlement.

The UI redirects after checkout only to explain that confirmation is pending.
Access changes after a verified, normalized webhook updates local subscription
state.

## Subscription products

Current payment plan catalog for new intents:

```text
member_share_20 through member_share_200
  optional manual monthly wxDAI member contribution, in $20 increments
```

`cohort_grad_20` and `cohort_participant_20` remain as historical payment keys
for existing records and intent confirmation. New cohort intents are rejected.
The current member amounts use a fixed set (`$20, $40, ... $200`) and server
validation of the internal plan key. The proposed $2.50 per RG share rate
requires a separate DAO-approved SOP before any issuance is promised. A future
fiat adapter would map member plans to provider-specific price references.

## Persistence target

PostgreSQL with Drizzle ORM is the durable store. Production uses the shared
Postgres server through a dedicated `participation` logical database and the
restricted `participation_app` login; it does not share tables or migration
state with PIE. The initial schema contains:

```text
users
app_role_assignments
subscriptions
wallet_links
payment_intents
payments
payment_events
issuance_periods
issuance_lines
entitlement_deliveries
audit_events
```

Payment and provider event references are unique for idempotency. Payment,
issuance, delivery, and append-only audit records preserve the pilot history.
The mock UI remains deterministic until the live launch and payment routes are
enabled; it does not fabricate production records.

## Brand implementation

The UI uses the current Louchi / Venture Beyond reign:

- parchment `#efe9d7` canvas;
- ink `#102d2c` and deep teal `#0a292b` structure;
- coral `#ee3c78` actions;
- acid lime `#d7e34d` status highlights;
- cyan `#b8e0df` secondary fields;
- Mazius Display for large editorial headings;
- EB Garamond for readable body copy; and
- Ubuntu Mono for metadata and system labels.

The initial dashboard remains restrained: strong typography, generous spacing,
thin borders, a small number of status colors, and no decorative illustration
that competes with billing or entitlement information.

## Environment contract

Mock slice:

```text
NEXT_PUBLIC_APP_MODE=mock
APP_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://participation_app:...@.../participation
DATABASE_POOL_MAX=10
```

Portal auth:

```text
PORTAL_MODULE_LAUNCH_SECRET=
PORTAL_LAUNCH_ISSUER=https://portal.raidguild.org
PORTAL_LAUNCH_AUDIENCE=portal-participation
PORTAL_MODULE_SLUG=portal-participation
PORTAL_CREDENTIAL_CLAIMS_ENABLED=false
PORTAL_WALLET_CLAIMS_ENABLED=false
SESSION_SECRET=
SESSION_TTL_SECONDS=28800
```

Portal emits `credentials` as `member` and `cohort_grad`; the module normalizes
`member` to its internal `raidguild_member` credential. Signed `wallets` entries
contain a checksummed address, `chainId: 100`, and `verifiedAt`. The two rollout
flags become `true` only after Portal's corresponding module disclosure flags
are deployed and enabled. Once authoritative, an omitted claim revokes stale
Portal-derived state instead of preserving it indefinitely.

Payment selection:

```text
PAYMENT_ADAPTERS=gnosis-wxdai-direct
GNOSIS_CHAIN_RPC_URL=
GNOSIS_PAYMENT_CONFIRMATIONS=12
GNOSIS_TREASURY_ADDRESS=0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC
GNOSIS_WXDAI_ADDRESS=0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
```

An eventual live adapter adds namespaced configuration such as API credentials,
webhook verification secrets, and mappings from internal plan keys to opaque
provider price references. Secrets must remain server-only.

## Verification gates

- lint passes;
- TypeScript compilation passes;
- domain unit tests pass;
- production build passes;
- member, graduate, participant, inactive, and app-admin mock views render;
- mobile layout remains usable; and
- no live payment or wallet capability exists in mock mode.
