# Onchain Subscription Shaman

## Status

This is a possible later implementation, not the recommended starting point.
All prices, discounts, caps, and issuance formulas below are illustrative
design assumptions pending DAO approval of a member contribution SOP. The
current module uses manual wxDAI payments and has no share-mint authority.
It would automate recurring wxDAI settlement and RG share issuance, but it must
hold Moloch v3 Manager permission to call `mintShares` outside the normal
proposal process.

Manager permission is powerful because a Manager Shaman can mint and burn DAO
shares and loot. The Baal contract limits the role at its boundary, but any bug
in the Shaman's public functions could still misuse that authority.

## Intended behavior

- Each eligible member has an internal wxDAI escrow balance.
- A member can deposit wxDAI into their own escrow.
- A member can withdraw uncommitted wxDAI from their own escrow.
- A member selects a subscription size subject to the monthly cap.
- Once per monthly epoch, anyone can settle an eligible member or a bounded
  batch of eligible members.
- Settlement deducts escrow, transfers wxDAI to the treasury, and atomically
  mints the corresponding RG shares.
- A DAO proposal can deposit backed wxDAI for multiple members when payments
  were collected outside crypto.

If the proposed rate of 2.5 wxDAI per share and proposed 200 wxDAI monthly cap
are approved, the illustrative per-member maximum would be 80 RG shares in a
monthly epoch.

That would be a 50% discount from the reference $5 RG share price; neither
the rate nor the cap is an adopted policy in this design document.

## Suggested interface

Names are illustrative and not yet a final contract API.

```solidity
function deposit(uint256 wxdaiAmount) external;
function withdraw(uint256 wxdaiAmount) external;
function setMonthlyShares(uint256 shares) external;
function cancelSubscription() external;
function settle(address[] calldata members) external;

function fundMembers(
    address[] calldata members,
    uint256[] calldata wxdaiAmounts
) external;
```

`settle` should be permissionless. This avoids depending on a special operator
and allows the work to be divided into several transactions when the member
list is too large for one block.

`fundMembers` should be callable only by the DAO treasury and must transfer or
account for real wxDAI in the same transaction. It must not create unbacked
escrow credits and should not accept arbitrary share amounts.

## Core invariants

If the illustrative values are approved, implementation and tests should enforce:

```text
minted shares for a member in an epoch <= 80 RG
a member is settled at most once per epoch
wxDAI charged = minted shares * 2.5 wxDAI
total member escrow liabilities <= Shaman wxDAI balance
treasury transfer and share mint are atomic
```

If either the treasury transfer or mint fails, the complete settlement must
revert without changing the member's balance or epoch state.

## Limits

At minimum, a future contract should have an immutable per-member epoch cap.
These constants are examples only and must follow the DAO-approved terms:

```solidity
uint256 constant PRICE_PER_SHARE = 2.5 ether;
uint256 constant MAX_MEMBER_PAYMENT_PER_EPOCH = 200 ether;
uint256 constant MAX_MEMBER_SHARES_PER_EPOCH = 80 ether;
```

The design should also consider:

- a global share issuance cap per epoch;
- a lifetime subscription-share cap per address;
- a maximum settlement batch size; and
- an eligibility registry or allowlist.

A per-address cap is not a per-person cap. Without an eligibility system, one
person can use several wallets to acquire more voting power than intended.

## Permission minimization

The safest Shaman should be an immutable, non-upgradeable contract with Manager
permission `2` only. It should contain no:

- arbitrary `call` or `delegatecall` entry point;
- generic mint or burn function;
- owner function that can bypass issuance limits;
- withdrawal function capable of moving another member's escrow; or
- mutable price, cap, token, Baal, or treasury address unless governance has
  explicitly accepted and constrained that mutability.

The DAO should retain the ability to revoke the Shaman's Manager permission by
proposal. A global epoch cap limits damage while governance responds to an
unexpected condition.

## Settlement mechanics

Epochs should use a deterministic global definition rather than a separate
rolling month for each member. For example:

```text
epoch = block.timestamp / 30 days
```

Calendar months may be preferable for accounting but require a carefully
defined schedule. The precise rule must be predictable onchain and documented
for members.

Settlement should receive a caller-supplied array rather than iterate over a
stored list of every subscriber. An unbounded loop can become impossible to
execute as membership grows.

The batch must reject duplicate addresses or ensure duplicate entries cannot
produce a second charge. Epoch state must be updated before external calls, and
the function should use reentrancy protection and safe ERC-20 transfers.

## Offline payment funding

Governance-controlled funding must preserve solvency. A safe pattern is:

1. The treasury approves or transfers an exact wxDAI amount.
2. `fundMembers` receives member and amount arrays.
3. The function verifies array parity and sums all allocations.
4. The Shaman pulls exactly the summed amount or verifies newly received funds.
5. Only then does it credit individual escrow balances.

The function should never let governance assign shares directly. Shares remain
derived from funded escrow at the fixed price during settlement.

## Security and governance questions

Before implementation, the DAO must decide:

- Who is eligible to subscribe?
- Is the limit per wallet, verified person, or recognized guild member?
- May members accumulate subscription shares indefinitely?
- What global monthly issuance is acceptable?
- Are full voting and ragequit-enabled RG shares intended?
- Can members withdraw until settlement, or is there a cutoff/commitment period?
- What happens when escrow funds cover only part of the configured subscription?
- Is partial settlement allowed, or should that member be skipped?
- How are emergency pauses implemented without adding excessive admin power?

## Required assurance before installation

Because the contract would receive ongoing mint authority, it should have:

- unit and invariant tests;
- fuzz tests for deposits, withdrawals, duplicate batches, and epoch boundaries;
- fork tests against the live RaidGuild Baal and Safe configuration;
- independent contract review or audit;
- verified source code and reproducible deployment artifacts; and
- a proposal that clearly identifies the exact deployed bytecode and grants
  only Manager permission.
