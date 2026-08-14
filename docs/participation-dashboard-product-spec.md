# Participation Dashboard Product Spec

## Status

Early product definition. This document defines the first useful shape of a
standalone Next.js participation and subscription app launched from the
RaidGuild Portal.

The first implementation should use manual monthly wxDAI payments and the
monthly batch `mintShares` workflow. A provider-neutral card adapter and the
onchain Subscription Shaman are possible later phases.

## Product intent

The Participation Dashboard gives a person one place to understand:

- how RaidGuild currently recognizes them;
- whether their subscription is active;
- what access their current status provides;
- their own participation history;
- any RG shares pending or already issued; and
- useful, privacy-conscious community participation signals.

The app is a Portal module, not a second community identity system. Portal owns
identity and community qualifications. This module owns billing, subscription
state, share issuance preparation, and its derived access decisions.

## System boundary

```text
RaidGuild Portal
  identity, profile, member role, cohort credentials
        |
        | short-lived signed launch token
        v
Participation Module
  local session, subscription, entitlements, dashboard
        |
        +---- Stablecoin adapter: monthly wxDAI direct to the treasury Safe
        +---- Future fiat adapter: card billing and automatic renewal
        +---- Gnosis Chain: RG balances and completed mint records
        +---- Monthly issuance export: reviewed DAO mintShares proposal
```

The launch token starts a module-local session. It is not a reusable Portal API
token and must never be stored as the local session credential.

## Model credentials, billing, and entitlements separately

The three concepts must not be collapsed into a single `tier` field.

### Portal credentials

Trusted facts supplied by Portal:

```text
raidguild_member
cohort_grad
cohort_participant
```

These answer who the person is in the community. Paying a subscription must not
create or upgrade a Portal credential.

For RaidGuild members, membership standing is independent of billing. Their
subscription is optional and is used to participate in the recurring share
purchase program. For cohort graduates and general participants, the $20 monthly
subscription keeps their coworking participation active, but cancellation does
not erase the underlying Portal recognition that they graduated or participated.

### Billing state

Facts supplied by the configured payment provider and stored from verified,
normalized webhooks:

```text
not_started
checkout_pending
trialing
active
past_due
canceled_at_period_end
canceled
unpaid
```

Billing answers whether paid benefits should currently be active. Client-side
checkout redirects are never authoritative payment confirmation.

The launch rail is a manual monthly wxDAI payment directly to the RaidGuild Safe
on Gnosis Chain. Card billing and automatic renewal are coming soon and should
not be presented as available until a provider is approved and configured.

Direct stablecoin payments do not automatically renew in the first version.
They activate a defined paid-through period only after independent onchain
verification. The user's payment rail does not change their entitlements,
pricing, or share calculation.

### Derived entitlements

Capabilities are calculated from a Portal credential plus current billing
state. Examples:

```text
shares.subscription_eligible
coworking.community
coworking.apprentice
coworking.guild
raids.full_priority_1
raids.full_priority_2_apprentice
learning.library
learning.live_programming
bounties.access
networking.access
```

Route and API authorization should check capabilities, not display labels.

## Proposed participation classes

Classes describe the subscription offer appropriate to a Portal credential.
They are not purchased identities.

### 1. RaidGuild member

Eligibility:

- Portal supplies the `raidguild_member` credential.
- Membership access does not require an active subscription.
- A subscription is optional and required only to accrue shares through the
  recurring subscription program.

Offer:

- Optional sliding share subscription from $20 through $200 per month.
- Subscription share accrual at the approved share price.
- Full digital coworking access independent of subscription status.
- Full participant standing in the digital coworking community. Operational
  administration is assigned separately and is not granted to every member.
- First consideration for full client raids.
- All learning, networking, workshop, and bounty access.

Share treatment:

- The standard RG price is $5 per share. Eligible member subscriptions receive
  a 50% discount and issue at $2.50 per RG.
- At the member subscription price, $20 represents 8 RG and $200 represents
  80 RG before any required currency-conversion policy.
- The dashboard distinguishes `estimated`, `eligible`, `proposed`, and `minted`
  shares. Only an executed onchain mint is shown as owned.
- Becoming a member does not create retroactive share eligibility for earlier
  non-member subscription periods.

### 2. Cohort graduate

Eligibility:

- Portal supplies the `cohort_grad` credential.
- The Portal already has a `cohort-grad` badge, but it is not currently included
  in external-module launch claims.
- The person does not currently have the higher-precedence member credential.

Offer:

- $20 per month subscription to remain an active coworking participant.
- No RG shares.
- Ongoing digital coworking access plus apprentice-specific spaces and sessions.
- Second consideration for appropriate client raids as an apprentice.
- All learning, workshop, networking, and bounty access.

Recommended coworking boundary:

- Include persistent community coworking and apprentice rooms while the
  subscription is active.
- Exclude member governance, private guild operations, and client-confidential
  rooms unless access is granted for a specific raid.

This creates meaningful continuity after graduation without making the paid
subscription equivalent to guild membership.

### 3. General cohort participant

Eligibility:

- Portal supplies the `cohort_participant` credential.
- The person is neither a recognized member nor cohort graduate.

Offer:

- $20 per month subscription to remain an active coworking participant.
- No RG shares.
- Educational materials, workshops, brown bags, networking, and bounties.
- Standard access to the digital coworking space while subscribed.
- No owner/admin, guild-governance, apprentice, or client-confidential access.
- No access or priority for full client raids.

The first release must define how someone earns and loses the participant
credential. A Portal `contributor` auth role is too broad to use as a substitute,
and a cohort commitment currently represents intent to participate rather than
verified participation.

## Recommended entitlement matrix

| Capability | RaidGuild member | Active cohort grad | Active participant |
| --- | --- | --- | --- |
| Subscription required to retain standing | No | Yes, $20/month | Yes, $20/month |
| Optional $20-$200 share subscription | Yes | No | No |
| Subscription RG shares | Yes, while subscribed | No | No |
| Digital coworking access | Always | While subscribed | While subscribed |
| Coworking/app administration | Only when explicitly assigned | Only when explicitly assigned | Only when explicitly assigned |
| Guild/private coworking | Yes | No | No |
| Standard community coworking | Yes | Yes | Yes |
| Apprentice spaces | Yes | Yes | No |
| Full client raid consideration | Priority 1 | Priority 2, apprentice-appropriate | No |
| Learning library | Yes | Yes | Yes |
| Workshops and brown bags | Yes | Yes | Yes |
| Networking | Yes | Yes | Yes |
| Bounties | Yes | Yes | Yes |

Priority means order of consideration, not guaranteed work, assignment, or
compensation. Raid staffing must still account for role fit, availability,
client requirements, and demonstrated capability.

## Precedence and transitions

A user can have more than one credential. Resolve the applicable class using:

```text
raidguild_member > cohort_grad > cohort_participant
```

Examples:

- A cohort graduate who becomes a member sees the member plan at the next plan
  transition; their graduate recognition remains on their Portal profile.
- A member who cancels remains a Portal member with full coworking access. They
  stop accruing subscription shares after the paid-through period.
- A cohort graduate or participant who cancels keeps their historical Portal
  credential but loses active coworking and other subscription-gated access
  after the paid-through date.
- A subscriber who graduates moves from participant to graduate benefits after
  Portal records the credential and the module refreshes it.
- No transition retroactively creates shares.

Plan transitions should normally take effect at the next billing boundary.
Immediate upgrades can be considered later if provider proration is explicitly
designed and tested.

## Access behavior by billing state

Recommended defaults:

| Billing state | Paid capabilities | Dashboard access |
| --- | --- | --- |
| Active or trialing | Enabled | Full |
| Past due | Grace period, then restricted | Full with payment warning |
| Cancel at period end | Enabled through paid-through date | Full |
| Canceled or unpaid | Disabled | Read-only history and restart CTA |

The grace-period duration is a policy decision. The normalized subscription
state and the module's explicit `entitlementEndsAt` should drive access; do not
infer it from the most recent invoice alone.

Billing state never disables a RaidGuild member's membership, full coworking
access, or member raid priority. For a member, it controls only
the optional share-subscription lifecycle and any benefits explicitly attached
to that subscription. For graduates and participants, it controls active
coworking and program access.

## Dashboard information architecture

### Overview

The first screen should answer four questions quickly:

1. What is my recognized participation class?
2. Is my subscription current?
3. What can I access right now?
4. What is the next useful action?

Suggested layout:

```text
+-------------------------------------------------------------+
| Participation status             Subscription               |
| RaidGuild Member                 Active - $80/month          |
| Portal verified                  Renews Sep 1                |
+-------------------------------+-----------------------------+
| Your access                   | Share issuance              |
| Full coworking access         | Eligible this period: 32 RG |
| Raid priority 1               | Proposed: 0 RG              |
| Learning + bounties           | Minted subscription: 96 RG  |
+-------------------------------+-----------------------------+
| Participation                                               |
| Events | bounties | projects | raids | contribution streaks |
+-------------------------------------------------------------+
| Community pulse (aggregated and privacy-conscious)          |
+-------------------------------------------------------------+
```

### Subscription

- Current plan and contribution amount.
- Direct wxDAI payment details; card payments marked coming soon.
- Billing status and paid-through/renewal date.
- Change contribution amount when the plan permits it.
- When the future card rail exists, open its provider-backed billing portal for
  payment method, invoices, and cancellation.
- Plain-language effect of cancellation.
- Payment problem and recovery state.
- For wxDAI: connected payer wallet, exact transfer instructions, confirmation
  state, transaction link, and paid-through period.

Do not collect or display raw card details in this application.

### Access

- Current capabilities in member-friendly language.
- Locked capabilities with an accurate explanation, not manipulative upgrade
  messaging.
- Direct links to coworking, learning, bounty, and raid-interest surfaces when
  those integrations exist.

The digital coworking integration should map the participation capabilities to
workspace roles:

```text
RaidGuild member     -> full member access
Active cohort grad   -> member + apprentice areas
Active participant   -> standard member
Inactive non-member  -> access removed or read-only, per workspace support
```

RaidGuild members may be the collective community owners of the space without
all holding technical administration privileges. Configuration, billing,
moderation, account recovery, entitlement exceptions, and integration controls
belong to specifically assigned app administrators.

Neither RaidGuild membership nor Portal's `admin` auth role automatically grants
Participation App administration. The module should maintain a separate,
explicitly assigned `participation_app_admin` role and can map that role to
technical administration in the coworking platform where appropriate.

## Participation App administration

The first release should use one local operational role:

```text
participation_app_admin
```

It may later be split into narrower capabilities if operations require it:

```text
subscriptions.read
subscriptions.manage
entitlements.manage
issuance.prepare
issuance.review
app_admins.manage
```

Rules:

- App admins are assigned explicitly; they are never inferred from subscription
  level or RaidGuild membership.
- Portal `admin` and `member` claims do not automatically become app admin.
- App-admin assignments are keyed to the durable Portal user ID.
- Every grant and removal records actor, subject, timestamp, and reason.
- An admin cannot grant shares directly or bypass issuance calculations.
- Issuance admins can prepare and export a batch, but DAO governance still
  authorizes the onchain `mintShares` proposal.
- Sensitive operations require a recent local session established through a
  fresh Portal launch.
- The app must retain at least one safe recovery path if all ordinary admins
  lose access.

For bootstrapping, use a narrowly scoped environment allowlist of Portal user
IDs or a one-time database seed. After bootstrap, normal admin changes should be
made through an audited app-admin workflow. Do not bootstrap by email address.

### Shares

Member-only subscription share panel:

- Contribution amount represented in the current issuance period.
- Estimated/eligible RG shares and the calculation used.
- Proposal number and status after inclusion in a batch.
- Transaction link after execution.
- Wallet receiving the shares.
- Onchain RG balance, clearly separated from subscription-issued RG.

The app must never label an offchain estimate or reconciled provider payment as
already minted shares.

### Personal participation

Potential metrics, added only when a reliable source exists:

- cohort participation and completion;
- sessions attended, hosted, or presented;
- bounties completed;
- projects or raids contributed to;
- badges and recognitions;
- subscription tenure;
- governance participation; and
- RG shares issued through this program.

Every metric needs a source label and last-updated time. Avoid combining unlike
activities into one opaque score in the MVP.

### Community participation

Start with aggregate signals rather than a payment leaderboard:

- active subscribers by class;
- sessions and workshops this period;
- bounties completed;
- projects or raids active;
- participation trend over time; and
- recent public recognitions.

Never expose another person's subscription amount, payment status, invoices, or
share estimate. Named leaderboards should be deferred and opt-in if introduced.

## Portal integration findings

The existing Portal already implements the required signed-launch foundation:

- `GET /api/modules/:slug/launch`
- short-lived HS256 JWTs;
- issuer, audience, type, expiration, and module slug claims;
- optional email, roles, profile ID, handle, and avatar claims; and
- module-level required auth roles.

Current limitations for this product:

1. The `member` auth role is available and can identify RaidGuild members.
2. The seeded `cohort-grad` badge exists, but profile badges are not included in
   the launch token.
3. There is no trusted `cohort_participant` credential in the launch token.
4. The launch token is a point-in-time snapshot; it does not revoke an existing
   module session when Portal status changes.

### Recommended Portal extension

Add a narrow `credentials` claim for this module rather than promoting badges
to auth roles:

```json
{
  "credentials": [
    "raidguild_member",
    "cohort_grad",
    "cohort_participant"
  ]
}
```

Portal should derive and sign these values from its authoritative records. The
module should not accept a credential asserted by the browser or inferred from
an email address.

The Portal module record would approximately use:

```text
moduleKind: external
authMode: signed_launch
launchAudience: participation
visibility: authenticated
includeEmailInLaunch: true
includeRolesInLaunch: true
includeProfileInLaunch: true
```

`visibility: authenticated` allows all three audiences to launch. Fine-grained
benefits are enforced by the Participation Module after the handoff.

For the first release, require users to relaunch through Portal when their
credential changes and keep module sessions reasonably short. A later
server-to-server refresh endpoint can provide faster revocation and credential
updates.

## Module-owned data

The module needs its own lifecycle and database. Initial records:

### Local user

```text
id
portalUserID (unique)
portalProfileID
email snapshot
display name snapshot
credential snapshot
credentialSyncedAt
appRoles: [] or [participation_app_admin]
walletAddress
createdAt / updatedAt
```

Portal IDs are the durable identity link. Email is not the primary key.

### Subscription

```text
userID
paymentProvider
providerCustomerReference (unique with provider)
providerSubscriptionReference (unique with provider)
planKey
contributionAmount
currency
billingStatus
currentPeriodStartsAt / currentPeriodEndsAt
cancelAtPeriodEnd
entitlementEndsAt
latestProviderEventCreatedAt
```

### Issuance period and line item

```text
period key and cutoff
user and destination wallet
eligible payment amount
share price and calculated shares
status: estimated / eligible / proposed / minted / excluded
proposal ID
transaction hash
exclusion or adjustment reason
source provider invoice/payment references
```

Webhook event IDs must be stored for idempotency. Financial and issuance changes
need an append-only audit trail or equivalent immutable event records.

## Security boundaries

- Verify Portal launch signature, `typ`, issuer, audience, module slug, and
  expiration before creating a local session.
- Never log or persist the raw Portal launch token.
- Require verified email if email is used to link a provider customer.
- Verify provider webhook authenticity against the unmodified request.
- Treat webhook handling as idempotent and robust to out-of-order delivery.
- Make all entitlement checks server-side.
- Make all app-administration checks server-side and deny by default.
- Do not infer app administration from Portal membership, Portal admin, payment
  amount, provider metadata, or browser-provided state.
- Keep payment-provider and Portal secrets server-only.
- Require reauthentication or a recent Portal launch for sensitive changes such
  as replacing the share destination wallet.
- Never mint from an application key. The module produces a reviewed proposal
  artifact; DAO governance authorizes the actual batch mint.

## Suggested delivery phases

### Phase 1: identity and product shell

- Scaffold the standalone Next.js app.
- Implement Portal callback verification and a secure local session.
- Upsert the local user by Portal user ID.
- Display credential snapshot, proposed class, and placeholder capabilities.
- Add a clear link back to Portal.

Initially, member recognition works from the existing `member` role. Cohort grad
and participant recognition require the Portal credential extension or a
temporary admin-reviewed assignment with an explicit migration plan.

### Phase 2: payment subscriptions

- Create plan/price configuration.
- Add hosted checkout and provider-backed customer billing management.
- Process signed webhooks and subscription state.
- Derive capabilities and implement billing lifecycle states.

### Phase 3: share issuance operations

- Calculate member-only eligible shares.
- Add cutoff, exception, and reconciliation views.
- Export a reviewed CSV and encoded batch `mintShares` inputs.
- Track proposal and execution references.

### Phase 4: participation data

- Integrate reliable Portal and onchain sources.
- Add personal metrics with provenance.
- Add aggregate community participation signals.
- Keep private billing data out of community views.

### Phase 5: consider onchain settlement

- Evaluate operational burden and failure rates from the manual process.
- Revisit the Subscription Shaman only if automation benefits justify permanent
  Manager permission and contract assurance costs.

## Open product decisions

- Are provider charges in USD while RG issuance is priced in wxDAI? If so, what
  exchange-rate source and timestamp apply?
- Are payment-processing fees a DAO expense, or do they reduce shares?
- Does a cohort participant subscription continue indefinitely after the cohort?
- What exact Portal fact creates `cohort_participant`?
- How and when is the `cohort-grad` badge awarded?
- How long is the past-due grace period?
- Does a $20 base plan allow voluntary contributions above $20 without changing
  entitlements?
- What platform is the digital coworking space, and which rooms map to community,
  apprentice, guild, and client-confidential access?
- Who records raid participation and priority decisions?
- Which participation metrics are sufficiently reliable for the MVP?

## MVP acceptance criteria

- A Portal user can launch the module without creating a second login.
- The module links the session to the correct Portal user ID.
- Payment cannot create a Portal member or cohort credential.
- RaidGuild membership and Portal administration do not automatically grant
  Participation App administration.
- Only explicitly assigned app admins can access operational administration.
- An eligible user can start and manage the appropriate subscription.
- Verified provider webhooks, not redirects, determine billing state.
- The dashboard accurately explains current class, billing status, capabilities,
  and next action.
- Only RaidGuild members with an active optional share subscription accrue
  subscription share eligibility.
- Pending shares are never presented as minted shares.
- A monthly export rejects duplicates and per-member amounts above the approved
  cap.
- Other users' payment amounts and statuses are not exposed.
- The application contains no wallet or contract key capable of minting RG.
