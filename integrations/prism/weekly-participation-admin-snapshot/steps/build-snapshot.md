# Build Provisional Snapshot

Build an API-ready snapshot from the collected evidence. This is an admin-only
preview, not an approved distribution.

Write `participation-metrics.v1.json` with exactly this contract:

```json
{
  "schemaVersion": 1,
  "snapshotKey": "YYYY-Www",
  "cycleKey": "source-defined-cycle-key",
  "windowStartsAt": "ISO-8601",
  "windowEndsAt": "ISO-8601",
  "generatedAt": "ISO-8601",
  "sourceSystem": "prism",
  "sourceTaskKey": "weekly-participation-admin-snapshot",
  "sourceRunId": "stable Prism request/workflow run identifier",
  "artifactSha256": "lowercase SHA-256 of activity-report.json",
  "status": "provisional",
  "members": [
    {
      "walletAddress": "0x...",
      "displayName": "optional label",
      "engagementScore": 0,
      "stewardshipScore": 0,
      "contributionScore": 0,
      "evidenceRefs": [],
      "auditFlags": []
    }
  ]
}
```

Rules:

- `snapshotKey` is the request time's UTC ISO week.
- Use one member row per unique wallet.
- Engagement is exactly 0 or 20, stewardship exactly 0 or 60, and contribution
  exactly 0 or 70. Never send a total; Participation computes it.
- `sourceRunId` must be stable for this workflow request and different for a new
  request. Prefer the Prism workflow run ID; otherwise use the request ID.
- Compute `artifactSha256` from the exact bytes of `activity-report.json`.
- Preserve evidence references and identity/evidence concerns in `auditFlags`.
- Validate the completed JSON locally before continuing.
