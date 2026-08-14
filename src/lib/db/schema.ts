import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const participationCredentialEnum = pgEnum('participation_credential', [
  'raidguild_member',
  'cohort_grad',
  'cohort_participant',
])

export const billingStatusEnum = pgEnum('billing_status', [
  'active',
  'past_due',
  'canceled',
  'not_started',
])

export const paymentRailEnum = pgEnum('payment_rail', [
  'fiat_recurring',
  'stablecoin_direct',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'observed',
  'confirmed',
  'expired',
  'failed',
  'refunded',
])

export const issuanceStatusEnum = pgEnum('issuance_status', [
  'draft',
  'review',
  'proposed',
  'executed',
  'canceled',
])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'delivered',
  'failed',
  'canceled',
])

export const daoMembershipRunStatusEnum = pgEnum('dao_membership_run_status', [
  'running',
  'succeeded',
  'failed',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portalUserId: text('portal_user_id').notNull(),
    portalProfileId: text('portal_profile_id'),
    email: text('email'),
    displayName: text('display_name'),
    credentials: participationCredentialEnum('credentials').array().notNull().default([]),
    credentialSyncedAt: timestamp('credential_synced_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_portal_user_id_unique').on(table.portalUserId)],
)

export const portalLaunches = pgTable(
  'portal_launches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jwtId: text('jwt_id').notNull(),
    portalUserId: text('portal_user_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('portal_launches_jwt_id_unique').on(table.jwtId),
    index('portal_launches_expires_at_idx').on(table.expiresAt),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const appRoleAssignments = pgTable(
  'app_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    assignedBy: text('assigned_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('app_role_assignments_user_role_unique').on(table.userId, table.role),
  ],
)

export const walletLinks = pgTable(
  'wallet_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    address: text('address').notNull(),
    verificationSource: text('verification_source').notNull().default('portal_launch'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('wallet_links_chain_address_unique').on(table.chainId, table.address),
    index('wallet_links_user_id_idx').on(table.userId),
  ],
)

export const daoMembershipRuns = pgTable(
  'dao_membership_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: integer('chain_id').notNull(),
    daoAddress: text('dao_address').notNull(),
    sharesTokenAddress: text('shares_token_address').notNull(),
    cutoffBlockNumber: bigint('cutoff_block_number', { mode: 'bigint' }),
    cutoffBlockHash: text('cutoff_block_hash'),
    thresholdRaw: numeric('threshold_raw', { precision: 78, scale: 0 }).notNull(),
    tokenDecimals: integer('token_decimals'),
    status: daoMembershipRunStatusEnum('status').notNull().default('running'),
    initiatedBy: text('initiated_by').notNull(),
    walletCount: integer('wallet_count').notNull().default(0),
    eligibleCount: integer('eligible_count').notNull().default(0),
    error: text('error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('dao_membership_runs_status_created_idx').on(table.status, table.createdAt)],
)

export const daoMembershipSnapshots = pgTable(
  'dao_membership_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull().references(() => daoMembershipRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    walletLinkId: uuid('wallet_link_id').notNull().references(() => walletLinks.id, { onDelete: 'restrict' }),
    walletAddress: text('wallet_address').notNull(),
    shareBalanceRaw: numeric('share_balance_raw', { precision: 78, scale: 0 }).notNull(),
    eligible: boolean('eligible').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('dao_membership_snapshots_run_wallet_unique').on(table.runId, table.walletLinkId),
    index('dao_membership_snapshots_run_idx').on(table.runId),
    index('dao_membership_snapshots_user_idx').on(table.userId),
  ],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    planKey: text('plan_key').notNull(),
    rail: paymentRailEnum('rail').notNull(),
    provider: text('provider').notNull(),
    providerCustomerReference: text('provider_customer_reference'),
    providerSubscriptionReference: text('provider_subscription_reference'),
    status: billingStatusEnum('status').notNull().default('not_started'),
    currentPeriodStartsAt: timestamp('current_period_starts_at', { withTimezone: true }),
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('subscriptions_user_id_idx').on(table.userId),
    uniqueIndex('subscriptions_provider_reference_unique').on(
      table.provider,
      table.providerSubscriptionReference,
    ),
  ],
)

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    walletLinkId: uuid('wallet_link_id').references(() => walletLinks.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    providerReference: text('provider_reference').notNull(),
    rail: paymentRailEnum('rail').notNull(),
    planKey: text('plan_key').notNull(),
    periodKey: text('period_key').notNull(),
    currency: text('currency').notNull(),
    amountMinorUnits: integer('amount_minor_units').notNull(),
    amountAtomic: numeric('amount_atomic', { precision: 78, scale: 0 }),
    chainId: integer('chain_id'),
    expectedSender: text('expected_sender'),
    recipient: text('recipient'),
    tokenAddress: text('token_address'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('payment_intents_provider_reference_unique').on(
      table.provider,
      table.providerReference,
    ),
    index('payment_intents_user_period_idx').on(table.userId, table.periodKey),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intentId: uuid('intent_id').references(() => paymentIntents.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerPaymentReference: text('provider_payment_reference').notNull(),
    rail: paymentRailEnum('rail').notNull(),
    planKey: text('plan_key').notNull(),
    periodKey: text('period_key').notNull(),
    currency: text('currency').notNull(),
    amountMinorUnits: integer('amount_minor_units').notNull(),
    amountAtomic: numeric('amount_atomic', { precision: 78, scale: 0 }),
    chainId: integer('chain_id'),
    transactionHash: text('transaction_hash'),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    payerWalletAddress: text('payer_wallet_address'),
    status: paymentStatusEnum('status').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('payments_provider_reference_unique').on(
      table.provider,
      table.providerPaymentReference,
    ),
    uniqueIndex('payments_transaction_hash_unique').on(table.chainId, table.transactionHash),
    uniqueIndex('payments_intent_id_unique').on(table.intentId),
    index('payments_user_period_idx').on(table.userId, table.periodKey),
  ],
)

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    eventReference: text('event_reference').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_events_provider_reference_unique').on(
      table.provider,
      table.eventReference,
    ),
  ],
)

export const issuancePeriods = pgTable(
  'issuance_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodKey: text('period_key').notNull(),
    cutoffAt: timestamp('cutoff_at', { withTimezone: true }).notNull(),
    status: issuanceStatusEnum('status').notNull().default('draft'),
    proposalId: text('proposal_id'),
    transactionHash: text('transaction_hash'),
    createdBy: text('created_by').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('issuance_periods_period_key_unique').on(table.periodKey)],
)

export const issuanceLines = pgTable(
  'issuance_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuancePeriodId: uuid('issuance_period_id').notNull().references(() => issuancePeriods.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
    recipientAddress: text('recipient_address').notNull(),
    eligibleAmountMinorUnits: integer('eligible_amount_minor_units').notNull(),
    sharePriceMinorUnits: integer('share_price_minor_units').notNull(),
    shareAmount: numeric('share_amount', { precision: 78, scale: 18 }).notNull(),
    status: issuanceStatusEnum('status').notNull().default('draft'),
    exclusionReason: text('exclusion_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('issuance_lines_period_user_unique').on(table.issuancePeriodId, table.userId),
    uniqueIndex('issuance_lines_payment_unique').on(table.paymentId),
  ],
)

export const entitlementDeliveries = pgTable(
  'entitlement_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    target: text('target').notNull(),
    snapshotVersion: integer('snapshot_version').notNull(),
    capabilities: text('capabilities').array().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: deliveryStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('entitlement_deliveries_idempotency_key_unique').on(table.idempotencyKey),
    index('entitlement_deliveries_pending_idx').on(table.status, table.createdAt),
  ],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_events_actor_idx').on(table.actorType, table.actorId, table.createdAt),
  ],
)
