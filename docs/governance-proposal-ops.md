# Batch mintShares proposal preparation (local pilot)

This is a proposal **artifact and review** workflow, not a minting service. It has no manager-shaman privilege, signing key, server-side proposal submission, sponsor/vote/process/execute action, or arbitrary call builder. App admins can prepare one deterministic Baal `mintShares(address[],uint256[])` action from an independently approved immutable monthly issuance revision. A second, different current app admin must approve the exact simulated artifact hash. The prepare endpoint rechecks chain evidence and returns only server-built transaction fields; the UI deliberately does not connect a signing/submission control.

## Provenance and deployed configuration

Source behavior was checked against [HausDAO's Baal.sol](https://github.com/HausDAO/Baal/blob/master/contracts/Baal.sol): `mintShares` is `baalOrManagerOnly`; `submitProposal` may self-sponsor when delegated `sharesToken.getVotes(submitter) >= sponsorThreshold`, otherwise requires `proposalOffering`; `processActionProposal` delegates to `multisendLibrary`, and `encodeMultisend` packs operation, target, value, data length and calldata into `multiSend(bytes)`. The exact deployed Gnosis configuration was read via Gnosis RPC on 2026-11-23, not inferred from a generic DAOhaus deployment:

| Item | Pinned value |
| --- | --- |
| Chain | Gnosis, `100` |
| RaidGuild Baal | [`0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986`](https://gnosisscan.io/address/0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986) |
| Shares token | [`0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6`](https://gnosisscan.io/address/0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6) |
| Safe avatar and target | [`0x181ebdb03cb4b54f4020622f1b0eacd67a8c63ac`](https://gnosisscan.io/address/0x181ebdb03cb4b54f4020622f1b0eacd67a8c63ac) |
| MultiSend library | [`0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761`](https://gnosisscan.io/address/0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761) |
| Baal clone implementation | `0x5dce1044a7e2e35d6524001796cee47252f18411` |
| Baal implementation runtime keccak256 | `0xad108b1388fa856dd961908ec7a51eac4b8730f742190ea162d32de7c6a44e59` |
| MultiSend bytecode keccak256 | `0x0208282bd262360d0320862c5ac70f375f5ed3b9d89a83a615b4d398415bdc83` |
| Safe proxy runtime keccak256 | `0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000` |
| Safe master copy (proxy slot 0 / `masterCopy()`) | [`0xd9db270c1b5e3bd161e8c8503c55ceabee709552`](https://gnosisscan.io/address/0xd9db270c1b5e3bd161e8c8503c55ceabee709552) |
| Safe master-copy runtime keccak256 | `0xbba688fbdb21ad2bb58bc320638b43d94e7d100f6f3ebaab0a4e4de6304b1c2e` |
| Shares-token proxy runtime keccak256 | `0xadb4ff4c20a069b6ef2e5cbef51bcc2054eae5e153cf11adc5471022a6f0199f` |
| Shares implementation (EIP-1967 slot) | [`0x8124cbb807a7b64123f3dec3ef64995d8b10d3eb`](https://gnosisscan.io/address/0x8124cbb807a7b64123f3dec3ef64995d8b10d3eb) |
| Shares implementation runtime keccak256 | `0xe160b6b6491ad5ad6735004dd4c3d2e0028dead5179630d5e338529902f20ffb` |
| Observed proposal offering | `1000000000000000000` wei native xDAI |
| Observed sponsor threshold | `100000000000000000000` delegated share units |
| Observed voting / grace periods | `259200` / `172800` seconds |

The Safe proxy's deployed bytecode reads its master copy from **storage slot 0**, and `masterCopy()` returned the same address in read-only Gnosis RPC. This matches [Safe's proxy source](https://github.com/safe-global/safe-smart-account/blob/main/contracts/proxies/SafeProxy.sol). The deployed shares-token runtime reads the [EIP-1967 implementation slot](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/proxy/ERC1967/ERC1967Upgrade.sol#L24), `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`; that storage value was read directly, not inferred from the token address. Code hashes above are `keccak256(eth_getCode(address, latest))` from read-only Gnosis RPC on 2026-11-23. The runtime rechecks every address, implementation slot and executable hash **at the same pinned block** as the Safe action and proposal submission simulations. This covers the Baal clone and implementation, Safe proxy and master copy, shares proxy and implementation, and MultiSend library; it does not assert any uninspected external dependencies. Any mismatch fails closed. Configuration values can change by DAO governance, so a new independently reviewed release is required if pins change.

## Review sequence

1. Finish the payment recovery and membership snapshot checks, resolve all exceptions, and secure explicit DAO-approved gross/net, refund, eligibility and issuance policy. The default `proposed-v1` / `unresolved` policy **blocks** approval and artifact creation. Never change these environment settings merely to bypass review.
2. Freeze a closed UTC period under `/admin`, inspect payment/source exclusions and canonical `>=100 RG` membership, then get an independent app-admin decision on the frozen hash. Corrections require a new revision.
3. A current app admin supplies the **intended submitter wallet** when building the proposal artifact. The present UI does not verify wallet connection and cannot submit; a future signing UI must enforce exact account match. The server encodes exactly one zero-value `CALL` to RaidGuild Baal's `mintShares`, wraps it in MultiSend for Baal's Safe-module execution path, then encodes `submitProposal`. All layers are decoded back and compared to the frozen payload; the operation, snapshot and artifact hashes are shown.
4. The server simulates the Safe-module action and the proposal submission separately at a recent pinned block, checking the explicit Safe success return and Baal proposal ID return. It discloses the offering and whether the submitter would auto-sponsor based on delegated votes. Simulation expires after five minutes. It is **not** a guarantee of passage or future execution.
5. Another explicitly assigned app admin independently approves or rejects the exact artifact hash. Builder and reviewer cannot be the same user. Decision insertion takes the same UTC-period advisory lock as revision freezing, re-derives payment/wallet evidence inside that transaction, and a database trigger rejects superseded or materially changed evidence. A changed revision, source evidence, policy, chain block/config, proposal count, delegated votes, simulation outcome, or expiry invalidates preparation; regenerate and review again.
6. The prepare endpoint rechecks the original block hash and reruns both simulations at a fresh pinned block. It returns `chainId`, `from`, `to`, `data`, and `valueRaw` only; there is no in-app send button and no server signer. A future wallet UX must compare the connected account and present full transaction details before human signing, then verify a successful receipt and `SubmitProposal` event to derive ID. It must never auto-sponsor, vote, process or mint.

## Release gates not met locally

- Run `drizzle/0012_odd_thunderbolt_ross.sql` and `0013_proposal_integrity.sql` against an isolated PostgreSQL instance and exercise insert/immutability/independent-review triggers. No local Postgres was available in this workspace.
- Run the exact Baal/Safe action and submit simulations against an isolated Gnosis fork with the deployed contracts, funded test wallet, and realistic latest approved frozen snapshot. Confirm that the Safe supports `execTransactionFromModuleReturnData`, Baal returns the expected proposal ID, and both explicit success checks work. No fork was available locally.
- Independently review bytecode provenance, calldata, proposal offering, sponsor rules, DAO policy and security before any real wallet submission. The current app intentionally cannot submit.
- No production migration, deployment, onchain proposal, transfer or Blockaid report has been performed by this work.
