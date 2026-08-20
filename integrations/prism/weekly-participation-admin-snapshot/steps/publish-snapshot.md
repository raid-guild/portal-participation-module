# Publish Admin Snapshot

Publish `participation-metrics.v1.json` to the Participation service.

Requirements:

1. Read the base URL from `PARTICIPATION_API_BASE_URL` and require HTTPS.
2. Read the bearer credential from `PARTICIPATION_METRICS_WRITE_KEY`.
3. POST the artifact as JSON to
   `$PARTICIPATION_API_BASE_URL/api/v1/participation/cycles/import`.
4. Never print, log, persist, or place the bearer credential in an artifact.
5. Accept HTTP 200 as an idempotent retry and HTTP 201 as a new import.
6. Treat all other responses as failures. Preserve the non-secret error response
   and do not claim publication succeeded.
7. Write `participation-import-receipt.json` containing only the returned import
   ID, snapshot key, counts, idempotent flag, status, response status, and UTC
   completion timestamp.

Return a concise result with the snapshot key, matched/unmatched counts, import
ID, and whether the import was idempotent. This endpoint is provisional only and
must not be described as approval, share issuance, or entitlement delivery.
