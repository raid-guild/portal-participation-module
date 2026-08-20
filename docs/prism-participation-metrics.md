# Prism participation metrics

Participation receives a weekly, provisional Participation Steward snapshot from
the Prism workflow and task definitions under
`integrations/prism/weekly-participation-admin-snapshot/`.

The Prism schedule is Monday at 14:00 UTC. The scheduled task creates at most one
workflow request per ISO week. That workflow reads the current Hall Monitor
source, audits it against Prism evidence, creates a versioned JSON artifact, and
publishes it through `POST /api/v1/participation/cycles/import`.

Snapshots are immutable imports retained for history. Repeating one Prism run is
idempotent, while reusing a run ID with a different artifact hash is rejected.
The app matches rows only through an active Portal-verified Gnosis wallet and
shows the latest snapshot only to explicitly assigned app admins. Imports are
provisional evidence: they cannot change billing, DAO membership, capabilities,
subscription-share reports, or onchain state.
