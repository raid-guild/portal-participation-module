# wxDAI payment reconciliation

The checkout now saves each submitted transaction hash before verifying it.
`payment_observations` stores pending/confirming state and chain evidence. The
wallet page polls while open; the server-side reconciler is required to
continue after the browser closes.

Confirmed observations are rechecked hourly for seven days after their mined
block, provided the minute-scale worker remains scheduled. A changed or
missing canonical receipt/block, or a now-invalid transfer, moves the
observation to `needs_review` and the retained payment row to `failed`. The
monthly share report selects only `confirmed` payments, so the contested
payment is excluded pending independent review. This is a conservative
exception state, not a claim that funds were refunded. Reorgs after the
seven-day window remain a residual risk and should be checked before freezing
any later governance batch.

## Deployment order

1. Run `pnpm db:migrate` before deploying code that reads the new table.
2. Deploy the application and verify `/api/health` and authenticated payment
   history.
3. Schedule `pnpm payments:reconcile` in a dedicated Railway cron service or
   equivalent job every minute, with the same server-only database and Gnosis
   RPC configuration. The command processes at most 25 due observations by
   default and exits. Do not run a permanent loop in the web service.
4. Monitor the job's last success, `needs_review` count, pending age, and
   last finality recheck. Do not schedule the worker less often than hourly if
   the seven-day recheck policy is relied upon.

Do not report automatic background confirmation as operational until the
scheduled job is actually installed and observed running. Never give a cron
job a Portal, Discord, or DAO signing key.

The verifier compares the transaction with its **stored intent** (chain,
token, sender, recipient, exact amount and mined-time window), checks a
successful receipt and emitted wxDAI `Transfer`, and waits for the configured
confirmation count. An expired intent can still confirm if the transaction
was mined during its original window. A native xDAI payment or different
transfer becomes a review exception rather than wxDAI credit.

For a payment missing from the UI, compare the exact transaction hash to the
Portal user's payment intent and observation, then the Gnosis receipt and
block. Do not directly insert a payment row or alter the share report. If no
valid intent exists, create a separate evidence-review procedure with an
independent admin approval before any manual correction.

Transactions submitted before this observation table existed have no saved
hash. The member may select their original intent on the wxDAI checkout page
and paste the exact transaction hash. The normal server verifier then checks
the original stored amount, sender, recipient, token and mined-time window;
this is not a manual payment override.
