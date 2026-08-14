export function createOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RaidGuild Participation Entitlements API',
      version: '0.1.0',
      description:
        'Service API for reading participation entitlements and planning delivery to Portal or Discord. Apply mode is intentionally unavailable until a connector is configured.',
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
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'rg_participation_session',
        },
        serviceKey: { type: 'http', scheme: 'bearer', bearerFormat: 'service-key' },
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
      },
    },
  } as const
}
