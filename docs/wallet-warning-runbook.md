# Wallet warning investigation

## Status

The tester reported a Zerion/Blockaid "Malicious DApp" warning for the
Participation deployment. This warning is **not resolved** by this repository
change. Do not tell testers to bypass it or switch domains to evade it. Pause
new wallet-connect testing until the deployed build and classification are
independently reviewed.

## Local code audit

The current live checkout requests an account, switches/adds Gnosis Chain,
and submits one `eth_sendTransaction` to the wxDAI token contract. Its calldata
is `transfer(treasury, exactAmount)` with zero native value. It does not call
`approve`, `setApprovalForAll`, or request a signature for an allowance. The
server independently verifies the transaction, receipt, Transfer event, and
intent before recording payment. This is a source-code observation, not proof
that the deployed site is trusted or that every dependency is harmless.

## Evidence packet for an authorized reporter

- Exact affected URL and final redirected URL.
- Date/time, wallet version, browser, Blockaid warning screenshot and warning
  details, including any reported reason or indicator.
- Git commit and Railway deployment ID of the served build; compare HTML/JS
  and environment configuration against this repository.
- Official RaidGuild ownership/contact evidence for the domain and repository.
- Intended chain 100, wxDAI token
  `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`, and treasury Safe
  `0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC`.
- Expected wallet request sequence and decoded calldata for the reported
  transaction, with no secret keys or personal information attached.
- Network, script, dependency, and redirect audit of the deployed build.

After the evidence is verified by an authorized RaidGuild operator, submit a
false-positive/developer report through [Blockaid's report portal](https://report.blockaid.io/).
Retest the exact deployed URL and wallet once Blockaid responds. A code-only
change cannot clear a third-party classification.

## Payment incident reference

The tester's successful Gnosis transaction
[`0xe5fc…1864`](https://gnosisscan.io/tx/0xe5fc6175a9b516af50dbe5d02f096f52e24541751bababbc9b136435ecc51864)
called the wxDAI contract with zero native value and emitted a 20 wxDAI
`Transfer` from `0x35b248d06bf280e17d8cbff63c56a58e52a936f1` to the
RaidGuild Safe. It mined at 2026-11-18 02:27:10 UTC. This onchain fact alone
does not prove which Participation intent belongs to it; production intent
and audit rows must be checked before crediting the account. There is no
hard-coded credit for this transaction in the app.
