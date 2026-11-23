# Immutable monthly issuance review

The current admin table and CSV are **live previews only**. A frozen review is
a separate, append-only, SHA-256-hashed evidence artifact for a closed UTC
month. It pins the successful Gnosis membership run, block/hash, canonical
verified recipient wallet, confirmed member-plan payments, exact integer
rate/cap, included and excluded payment evidence, and policy version. Payment
source links and independent review decisions are append-only database rows.
The payload is authoritative: source rows are a checked audit manifest, not
an alternate source from which proposal calldata may be generated. A database
trigger permits source inserts only in the snapshot-creation transaction,
checks every row against the payload, and checks manifest completeness at
commit. Another trigger rejects a decision with a different hash, the creator
as reviewer, a non-admin reviewer, or a superseded revision.

## Before freezing

1. Finish payment reconciliation and resolve `needs_review`, failed, and
   refunded contributions. Refresh the canonical DAO membership run after the
   UTC month ends.
2. Confirm the DAO-approved gross-versus-net treatment and discounted-share
   SOP. The app can freeze a review under `proposed-v1`/`unresolved`, but it
   blocks approval. Only after actual governance approval should an operator
   set `ISSUANCE_REVIEW_POLICY_VERSION` to the approved version and
   `ISSUANCE_REVIEW_PAYMENT_BASIS=gross`. Net basis is not supported until
   settlement/fee evidence is modeled.
3. Freeze from the admin screen. The system uses the first instant of the
   following UTC month as the cutoff; it does not accept a browser-selected
   cutoff or recipients.
4. Inspect the JSON export, excluded-payment reasons, exact recipient list,
   and hash. Corrections require a new revision. The earlier revision remains
   immutable and cannot be approved once superseded. A decision is final for
   its revision; freezing again after a rejection creates a new revision even
   if the underlying payload is unchanged, while retaining the same content
   hash and the previous decision history.
5. A different currently assigned app admin records an approval or rejection
   with a note. The service re-derives the pinned evidence first. Payment,
   wallet, membership, or policy drift blocks approval and flags the frozen
   revision stale.

An issuance approval records a review decision only. A separate local
[governance proposal preparation workflow](./governance-proposal-ops.md) can now
build, decode and simulate one batch proposal from the approved payload, with
its own independent artifact approval. Wallet submission, sponsorship, voting,
processing, minting, shaman permission, and server signing remain disabled.

## Prism metric boundary

Prism imports remain provisional. A server-computed normalized content hash
is stored at import; an explicit app admin may approve that exact import for
participant display. Only a line matched to the participant's **currently
verified, unrevoked** Portal wallet and carrying no audit flags is displayed.
The participant view shows scores and freshness but never raw evidence URLs.
Import and approval write only metric/audit tables; they cannot change billing,
credentials, DAO membership, capabilities, issuance, or shares.

Older Prism imports without a server content hash cannot be approved; publish
a new source run. The source run ID and normalized content hash together guard
idempotency and detect conflicting replay.
