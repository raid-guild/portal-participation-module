export function createOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RaidGuild Participation Service API',
      version: '0.3.0',
      description:
        'Service API for participation entitlements, delivery planning, provisional Prism metric imports, admin-approved metric display, immutable issuance review, and reviewed governance proposal preparation. Metrics cannot change access, billing, membership, or issue shares. No proposal submission or minting is exposed.',
    },
    servers: [{ url: '/' }],
    paths: {
      '/api/health': {
        get: {
          operationId: 'getHealth',
          responses: { '200': { description: 'Service health' } },
          security: [],
          summary: 'Check service health',
        },
      },
      '/api/session': {
        get: {
          operationId: 'getBrowserSession',
          responses: {
            '200': { description: 'Authenticated Portal-linked browser session' },
            '401': { description: 'No valid browser session' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'Inspect the current Portal-linked browser session',
        },
      },
      '/api/admin/dao-membership/refresh': {
        post: {
          operationId: 'refreshDaoMembership',
          responses: {
            '200': { description: 'Completed canonical Gnosis membership snapshot' },
            '401': { description: 'No valid browser session' },
            '403': { description: 'Participation app admin role required' },
            '502': { description: 'Gnosis RPC or contract validation failed' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'Refresh canonical DAO membership balances at one confirmed block',
        },
      },
      '/api/admin/report.csv': {
        get: {
          operationId: 'exportParticipationReport',
          responses: {
            '200': { description: 'Monthly review-only participation CSV' },
            '401': { description: 'No valid browser session' },
            '403': { description: 'Participation app admin role required' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'Export canonical membership and confirmed-payment review data',
        },
      },
      '/api/admin/issuance': {
        get: {
          operationId: 'listFrozenIssuanceReviews',
          responses: { '200': { description: 'List immutable monthly review revisions' }, '403': { description: 'Current app admin required' } },
          security: [{ sessionCookie: [] }], summary: 'List frozen issuance evidence',
        },
        post: {
          operationId: 'freezeIssuanceReview',
          responses: { '201': { description: 'Frozen hashed revision' }, '403': { description: 'Current app admin required' }, '409': { description: 'Period or membership evidence not ready' } },
          security: [{ sessionCookie: [] }], summary: 'Freeze a closed UTC month for independent review',
        },
      },
      '/api/admin/issuance/{id}': {
        get: { operationId: 'getFrozenIssuanceReview', responses: { '200': { description: 'Frozen payload and current staleness' }, '403': { description: 'Current app admin required' } }, security: [{ sessionCookie: [] }], summary: 'Inspect a frozen issuance revision' },
      },
      '/api/admin/issuance/{id}/export': {
        get: { operationId: 'exportFrozenIssuanceReview', responses: { '200': { description: 'Hashed JSON evidence artifact' }, '403': { description: 'Current app admin required' } }, security: [{ sessionCookie: [] }], summary: 'Download immutable monthly review evidence' },
      },
      '/api/admin/issuance/{id}/review': {
        post: { operationId: 'reviewFrozenIssuance', responses: { '200': { description: 'Append-only independent admin decision' }, '403': { description: 'Creator or non-admin cannot approve' }, '409': { description: 'Stale, blocked, or superseded revision' } }, security: [{ sessionCookie: [] }], summary: 'Record independent approval or rejection of exact payload hash' },
      },
      '/api/admin/issuance/{id}/proposal': {
        post: { operationId: 'simulateBatchMintProposal', responses: { '201': { description: 'Immutable, server-built, decoded and simulated proposal artifact' }, '403': { description: 'Current app admin required' }, '409': { description: 'Frozen evidence, chain configuration, or simulation failed' } }, security: [{ sessionCookie: [] }], summary: 'Build one batch mintShares proposal from independently approved frozen content' },
      },
      '/api/admin/proposals/{id}': {
        get: { operationId: 'getBatchMintProposalArtifact', responses: { '200': { description: 'Decoded artifact, simulation, review and readiness state' }, '403': { description: 'Current app admin required' } }, security: [{ sessionCookie: [] }], summary: 'Inspect a governance proposal artifact' },
      },
      '/api/admin/proposals/{id}/review': {
        post: { operationId: 'reviewBatchMintProposalArtifact', responses: { '200': { description: 'Append-only decision bound to exact artifact hash' }, '403': { description: 'Builder cannot approve or non-admin denied' }, '409': { description: 'Artifact stale, superseded, expired or already reviewed' } }, security: [{ sessionCookie: [] }], summary: 'Independently approve or reject a simulated proposal artifact' },
      },
      '/api/admin/proposals/{id}/prepare': {
        post: { operationId: 'prepareBatchMintWalletTransaction', responses: { '200': { description: 'Server-built wallet transaction only; no submission or signing' }, '403': { description: 'Current app admin required' }, '409': { description: 'Approval, pinned block, chain config, or fresh simulation failed' } }, security: [{ sessionCookie: [] }], summary: 'Revalidate approved artifact and return its exact wallet transaction request' },
      },
      '/api/admin/metrics/{id}/approve': {
        post: { operationId: 'approvePrismMetricImport', responses: { '200': { description: 'Approved exact import content hash for participant display' }, '403': { description: 'Current app admin required' }, '409': { description: 'Legacy import has no server content hash' } }, security: [{ sessionCookie: [] }], summary: 'Approve provisional Prism evidence without changing entitlements' },
      },
      '/api/payments/intents': {
        post: {
          operationId: 'createStablecoinPaymentIntent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['planKey'],
                  properties: { planKey: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Exact direct-to-treasury wxDAI transfer instructions' },
            '401': { description: 'No valid browser session' },
            '403': { description: 'Plan or request origin is not authorized' },
            '409': { description: 'Verified wallet missing or period already paid' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'Create an expiring stablecoin payment intent',
        },
      },
      '/api/payments/confirm': {
        post: {
          operationId: 'confirmStablecoinPayment',
          responses: {
            '200': { description: 'Payment independently verified and confirmed' },
            '202': { description: 'Transaction pending or below confirmation threshold' },
            '401': { description: 'No valid browser session' },
            '422': { description: 'Transaction does not exactly match the intent' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'Verify a Gnosis wxDAI transaction against its intent',
        },
      },
      '/api/payments/history': {
        get: {
          operationId: 'getOwnPaymentHistory',
          responses: {
            '200': { description: 'Own wxDAI intents, observations, and verified payment receipts' },
            '401': { description: 'No valid browser session' },
          },
          security: [{ sessionCookie: [] }],
          summary: 'List authenticated participant payment history',
        },
      },
      '/api/v1/entitlements/{portalUserId}': {
        get: {
          operationId: 'getEntitlementSnapshot',
          parameters: [
            {
              in: 'path',
              name: 'portalUserId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Resolved entitlement snapshot',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EntitlementSnapshot' },
                },
              },
            },
            '401': { description: 'Invalid or missing service key' },
            '404': { description: 'Subject not found' },
            '503': { description: 'Service API is not configured' },
          },
          security: [{ serviceKey: [] }],
          summary: 'Resolve a subject’s current entitlements',
        },
      },
      '/api/v1/entitlements/reconcile': {
        post: {
          operationId: 'reconcileEntitlements',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReconciliationRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Dry-run reconciliation plan' },
            '400': { description: 'Invalid request' },
            '401': { description: 'Invalid or missing service key' },
            '404': { description: 'Subject not found' },
            '501': { description: 'Apply connector is not configured' },
            '503': { description: 'Service API is not configured' },
          },
          security: [{ serviceKey: [] }],
          summary: 'Plan or apply delivery to entitlement consumers',
        },
      },
      '/api/v1/participation/cycles/import': {
        post: {
          operationId: 'importProvisionalParticipationMetrics',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ParticipationMetricImport' },
              },
            },
          },
          responses: {
            '201': { description: 'Provisional Prism snapshot stored' },
            '200': { description: 'Identical Prism run already stored; no duplicate created' },
            '400': { description: 'Snapshot contract or rubric score is invalid' },
            '401': { description: 'Invalid or missing metrics write credential' },
            '409': { description: 'Prism run ID was reused with a different artifact hash' },
            '503': { description: 'Metrics import is not configured' },
          },
          security: [{ metricsWriteKey: [] }],
          summary: 'Import an admin-only provisional weekly participation snapshot from Prism',
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'rg_participation_session',
        },
        serviceKey: { type: 'http', scheme: 'bearer', bearerFormat: 'service-key' },
        metricsWriteKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'metrics-write-key',
          description: 'Dedicated Prism-to-Participation write credential.',
        },
      },
      schemas: {
        EntitlementSnapshot: {
          type: 'object',
          required: [
            'schemaVersion',
            'subject',
            'participationClass',
            'billingStatus',
            'credentials',
            'capabilities',
            'evaluatedAt',
          ],
          properties: {
            schemaVersion: { const: 1 },
            subject: {
              type: 'object',
              required: ['portalUserId'],
              properties: { portalUserId: { type: 'string' } },
            },
            participationClass: {
              enum: ['member', 'cohort_grad', 'cohort_participant'],
            },
            billingStatus: {
              enum: ['active', 'past_due', 'canceled', 'not_started'],
            },
            credentials: { type: 'array', items: { type: 'string' } },
            capabilities: { type: 'array', items: { type: 'string' } },
            evaluatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ReconciliationRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['portalUserId', 'targets'],
          properties: {
            portalUserId: { type: 'string' },
            targets: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { enum: ['portal', 'discord'] },
            },
            mode: { enum: ['dry_run', 'apply'], default: 'dry_run' },
          },
        },
        ParticipationMetricImport: {
          type: 'object',
          additionalProperties: false,
          required: [
            'schemaVersion',
            'snapshotKey',
            'cycleKey',
            'windowStartsAt',
            'windowEndsAt',
            'generatedAt',
            'sourceSystem',
            'sourceTaskKey',
            'sourceRunId',
            'artifactSha256',
            'status',
            'members',
          ],
          properties: {
            schemaVersion: { const: 1 },
            snapshotKey: { type: 'string', pattern: '^\\d{4}-W\\d{2}$' },
            cycleKey: { type: 'string' },
            windowStartsAt: { type: 'string', format: 'date-time' },
            windowEndsAt: { type: 'string', format: 'date-time' },
            generatedAt: { type: 'string', format: 'date-time' },
            sourceSystem: { const: 'prism' },
            sourceTaskKey: { const: 'weekly-participation-admin-snapshot' },
            sourceRunId: { type: 'string' },
            artifactSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            status: { const: 'provisional' },
            members: {
              type: 'array',
              maxItems: 500,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'walletAddress',
                  'engagementScore',
                  'stewardshipScore',
                  'contributionScore',
                ],
                properties: {
                  walletAddress: { type: 'string' },
                  displayName: { type: 'string' },
                  engagementScore: { enum: [0, 20] },
                  stewardshipScore: { enum: [0, 60] },
                  contributionScore: { enum: [0, 70] },
                  evidenceRefs: { type: 'array', items: { type: 'string' } },
                  auditFlags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  } as const
}
