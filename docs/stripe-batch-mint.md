# Offchain Subscription and Batch Share Minting

## Summary

This is the recommended first implementation. Payments are collected through a
selected recurring payment provider, proceeds are transferred from the payout
account to the RaidGuild treasury, and one monthly DAO proposal issues shares
to all eligible members.

No Shaman is required. Share issuance stays behind the DAO's normal proposal,
voting, grace-period, and execution process.

## Monthly workflow

1. Collect subscriptions through the configured payment provider.
2. Wait for the accounting cutoff and reconcile successful payments, refunds,
   disputes, and chargebacks.
3. Convert and transfer the required funds from the bank to the RaidGuild Safe.
4. Produce a reviewed issuance file containing each member address, eligible
   payment amount, and calculated RG shares.
5. Verify that the treasury received the funds.
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

The standard RG price is $5. The member subscription program applies a 50%
discount, making the subscription issuance price $2.50 or 2.5 wxDAI per share.
The example therefore represents payments of 200, 100, and 50.
The proposal may be created through a DAOhaus membership/minting form if it
supports multiple recipients, or as a custom contract/multicall proposal.

## Required validation

Before generating proposal calldata, the issuance data should enforce:

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

- the provider settlement period;
- the bank-to-chain or conversion transaction hash;
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

Choose whether a 200 currency-unit charge purchases 80 shares even when
the DAO receives less after fees, or whether shares are based on net proceeds.

Using the gross charge is easier for members to understand and treats payment
processing fees as a DAO expense. Whatever rule is chosen should remain stable
and be stated in the subscription terms.

### Currency conversion

The 2.5 price is denominated in wxDAI. If the provider charges another currency, the
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
