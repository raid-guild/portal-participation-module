# Proposed Manual Member Contribution and Batch Share Minting

## Summary

This is a proposed SOP pending DAO approval. Members may make optional manual
monthly wxDAI contributions directly to the RaidGuild treasury. A steward
reconciles confirmed payments and prepares one monthly DAO proposal for
eligible members. Cohort participants and graduates do not pay to participate.

No Shaman is required. Share issuance stays behind the DAO's normal proposal,
voting, grace-period, and execution process.

## Monthly workflow

1. Reconcile optional member wxDAI contributions sent directly to the Safe.
2. Wait for the accounting cutoff and reconcile successful payments, refunds,
   disputes, and chargebacks.
3. Verify the funds arrived at the RaidGuild Safe.
4. Produce a reviewed issuance file containing each member address, eligible
   payment amount, and calculated RG shares.
5. Freeze the reviewed batch and have a second person verify its entries.
6. Submit one proposal containing the batch `mintShares` call.
7. Have at least one person other than the preparer verify the proposal calldata
   against the reviewed issuance file.
8. Vote on and execute the proposal through the normal DAO process.

## Baal call

The DAO contract supports issuing shares to multiple recipients in one call:

```solidity
mintShares(
    address[] calldata recipients,
    uint256[] calldata amounts
)
```

Example:

```text
recipients = [memberA, memberB, memberC]
amounts    = [80e18,   40e18,   20e18]
```

The proposed reference price is $5 per RG. The proposed member rate is 50%
lower, or 2.5 wxDAI per share. If approved, this illustrative example would
represent payments of 200, 100, and 50 wxDAI. It is not an executed mint.
The proposal may be created through a DAOhaus membership/minting form if it
supports multiple recipients, or as a custom contract/multicall proposal.

## Required validation

If the DAO approves the SOP, proposal preparation should enforce:

```text
eligible payment per member <= 200 wxDAI
shares per member            <= 80 RG per monthly period
shares                       = eligible payment / 2.5 wxDAI
each recipient address       appears exactly once
sum of represented payments  <= verified treasury deposit
```

Additional checks should reject:

- the zero address;
- malformed or non-checksummed addresses in human-facing reports;
- duplicate addresses with different capitalization;
- negative adjustments;
- fractional results that do not follow an approved rounding policy; and
- a recipient or amount array length mismatch.

The final onchain amounts must use 18-decimal RG units. For example, 80 RG is
encoded as `80000000000000000000`.

## Proposal documentation

Each monthly proposal should identify:

- the monthly cutoff and Gnosis payment transaction hashes;
- gross customer payments;
- refunds, disputes, and chargebacks;
- processing and conversion fees;
- the amount received by the treasury;
- the total RG shares requested;
- the issuance file or a durable content hash; and
- who prepared and independently reviewed the batch.

Do not publish member names or payment-provider customer information onchain. The public
issuance artifact should contain only the information needed to audit the mint,
normally wallet addresses and amounts.

## Decisions still needed

### Gross or net pricing

If card payments are later introduced, choose whether a 200 currency-unit
charge purchases 80 shares when the DAO receives less after fees, or whether
shares are based on net proceeds.

Using the gross charge is easier for members to understand and treats payment
processing fees as a DAO expense. Whatever rule is chosen should remain stable
and be stated in any future member contribution terms.

### Currency conversion

The proposed 2.5 price is denominated in wxDAI. If a future provider charges another currency, the
DAO needs a documented conversion rule, timestamp, exchange-rate source, and
rounding policy.

### Failed payments and later disputes

Shares should not be minted for failed or immediately refundable payments.
Governance must decide how to treat a chargeback received after shares have
already been issued. Burning a member's shares later is a separate governance
action and should not be assumed to happen automatically.

## Possible tooling

A later tool can import a reconciled CSV, validate all limits, and generate:

- the recipient array;
- the 18-decimal share amount array;
- aggregate totals;
- a human-readable audit report; and
- the encoded `mintShares` proposal calldata.

Such a tool does not need a private key or minting authority. Governance remains
the final authorization layer.
