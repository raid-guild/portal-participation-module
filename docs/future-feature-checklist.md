# Future Feature Checklist

This checklist records deliberately deferred work for the RaidGuild
participation module. Items here are not promises of automatic access or share
issuance. Billing evidence, DAO membership, proposal construction, governance
authorization, and downstream entitlement delivery remain separate systems.

## Monthly payment-cap hardening

- [ ] Add a PostgreSQL uniqueness rule preventing more than one active confirmed
  payment per user and participation period.
- [ ] Recheck the user-period limit inside the payment-confirmation transaction
  so multiple pre-created intents cannot race to confirmation.
- [ ] Define how refunds release or replace the one-payment-per-period slot.
- [ ] Add concurrency tests covering two intents and two transaction hashes for
  the same user and month.
- [ ] Give admins an explicit overpayment/refund workflow without ever turning
  an excess payment into excess shares.
- [ ] Expire abandoned payment intents with a scheduled maintenance job.

The issuance report already rejects a monthly total above 200 wxDAI and awards
zero proposed shares to that exception. The database work above would also
prevent the duplicate confirmed-payment state from being created.

## Admin-built `mintShares` proposal

The admin screen can eventually prepare and submit a normal governance proposal
that calls the Baal DAO's batch `mintShares(address[],uint256[])` function. The
module should never receive Manager Shaman permission or a key that can mint
shares directly.

### Freeze the issuance source

- [ ] Create an immutable issuance period from a successful DAO membership
  snapshot and a closed payment cutoff.
- [ ] Include only confirmed, non-refunded member-plan payments.
- [ ] Require canonical membership (`>=100 RG`) at the recorded Gnosis block.
- [ ] Aggregate each verified recipient address exactly once.
- [ ] Enforce payment `<=200 wxDAI` and issuance `<=80 RG` per recipient per
  monthly period.
- [ ] Require `shares = payment / 2.5`, using exact 18-decimal integer units and
  an explicitly approved rounding policy.
- [ ] Reject zero addresses, duplicate addresses, array-length mismatches,
  unsupported plans, missing wallets, and unresolved report exceptions.
- [ ] Store a content hash of the frozen human-readable issuance report.

### Construct and review the proposal

- [ ] Generate the recipient and amount arrays from the frozen period; never
  accept arbitrary arrays from the browser.
- [ ] Encode the exact Baal `mintShares` calldata and decode it back into a
  human-readable review before submission.
- [ ] Display per-recipient and aggregate payment/share totals.
- [ ] Require a second app admin to approve the frozen batch before enabling
  wallet submission.
- [ ] Simulate the proposal call against the current Gnosis block and reject a
  revert or unexpected target.
- [ ] Confirm the target is the configured RaidGuild Baal and the function
  selector is the expected batch mint function.
- [ ] Revalidate the current DAOhaus proposal ABI and submission path against the
  deployed Gnosis contracts before implementation.

### Submit without mint authority

- [ ] Let any connected address submit the proposal transaction through its own
  wallet.
- [ ] Keep proposal submission distinct from sponsorship: a qualifying DAO
  member must sponsor it through the normal governance path.
- [ ] Do not auto-sponsor, vote, process, or execute from a service key.
- [ ] Store the proposal ID, submission transaction hash, submitter address,
  frozen issuance hash, and timestamps.
- [ ] Track proposal lifecycle state from Gnosis without treating submission as
  successful issuance.
- [ ] Mark issuance executed only after verifying the final successful onchain
  execution and resulting share balances/events.
- [ ] Provide a downloadable DAOhaus/manual fallback artifact if wallet
  submission is unavailable.

### Governance decisions

- [ ] Approve gross-versus-net payment treatment and fee accounting.
- [ ] Approve refund and post-issuance dispute handling.
- [ ] Decide whether a global monthly share cap is required in addition to the
  per-member cap.
- [ ] Decide whether an address may accumulate discounted shares indefinitely.
- [ ] Document who performs independent monthly review and sponsorship.

## Payment operations

- [ ] Add automatic confirmation polling or a durable Gnosis watcher so users
  do not need to press “Check confirmations.”
- [ ] Use a production RPC provider with an SLA and a monitored fallback.
- [ ] Add admin tooling for expired intents, wrong transfers, duplicates,
  refunds, and reconciliation against the treasury Safe.
- [ ] Add payment receipts and monthly payment history to the participant view.
- [ ] Add a reminder workflow before the next manual monthly payment.
- [ ] Add a narrowly scoped card-payment adapter when RaidGuild has an eligible
  provider and approved merchant/payout setup.

## Portal, Discord, and participation metrics

- [ ] Implement idempotent Portal entitlement delivery with a scoped service
  credential, durable outbox processing, retry policy, and rollback procedure.
- [ ] Implement a Discord connector that manages only participation-owned roles.
- [ ] Require reconciliation dry-run review before enabling either connector's
  apply mode.
- [ ] Add read-only Portal/Discord participation metrics with clear provenance
  and freshness timestamps.
- [ ] Define the public/private boundary for activity, cohort, and member data.

## Operational maturity

- [ ] Add scheduled DAO membership snapshots and alert on contract/token
  validation failure.
- [ ] Add RPC, database, payment-confirmation, and entitlement-delivery alerts.
- [ ] Add explicit app-admin grant/revoke UI with audit history and two-person
  review for sensitive operations.
- [ ] Add backup-restore testing and documented recovery objectives.
- [ ] Add end-to-end tests using a Gnosis fork and isolated test wallets before
  enabling proposal submission.
- [ ] Conduct a governance/security review of the complete monthly issuance
  workflow.
