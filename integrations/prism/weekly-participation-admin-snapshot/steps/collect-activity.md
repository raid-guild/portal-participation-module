# Collect Participation Activity

Collect evidence for the active Participation Steward cycle as of the request's
UTC creation time.

1. Use the current Hall Monitor model from
   `raid-guild/hallmonitor/docs/participation-steward/readme.md`.
2. Locate the current or latest applicable exported cycle artifact under
   `docs/participation-steward/`. Treat that artifact as the proposed source and
   audit it against Prism evidence.
3. Use `prism-api-reader` for meeting attendance and raid, RIP, cohort, or
   mentorship artifacts. Use Hats/role evidence when available for stewardship.
4. Never fall back to the historical Raid/RIP/CookieJar/Meeting monthly weights.
5. Do not guess a cycle window, wallet, identity, or score. If the current cycle
   source cannot be established, stop with a blocker and do not publish.

Write durable workflow artifacts:

- `activity-report.md`
- `activity-report.json`
- `cycle-source.md`
- `evidence-index.json`

Every scored wallet must have evidence references or a clearly stated audit
flag. Wallet addresses must be valid Gnosis/EVM addresses.
