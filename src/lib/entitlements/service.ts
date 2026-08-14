import {
  deriveCapabilities,
  resolveParticipationClass,
  type BillingStatus,
  type Capability,
  type ParticipationCredential,
} from '../domain/participation'
import { mockPersonas } from '../mock/fixtures'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db/client'
import { users } from '../db/schema'
import { getParticipantDashboardState } from '../dashboard/service'

export const ENTITLEMENT_TARGETS = ['portal', 'discord'] as const

export type EntitlementTarget = (typeof ENTITLEMENT_TARGETS)[number]

export type EntitlementSnapshot = {
  billingStatus: BillingStatus
  capabilities: Capability[]
  credentials: ParticipationCredential[]
  evaluatedAt: string
  participationClass: ReturnType<typeof resolveParticipationClass>
  schemaVersion: 1
  subject: {
    portalUserId: string
  }
}

export type ReconciliationAction = {
  operation: 'replace_capabilities'
  portalUserId: string
  target: EntitlementTarget
  values: Capability[]
}

const mockBillingByPortalUserId: Record<string, BillingStatus> = {
  'portal-1042': 'active',
  'portal-1228': 'active',
  'portal-1317': 'past_due',
}

export function getMockEntitlementSnapshot(
  portalUserId: string,
  evaluatedAt = new Date().toISOString(),
): EntitlementSnapshot | null {
  const persona = Object.values(mockPersonas).find(
    (candidate) => candidate.portalUserID === portalUserId,
  )

  if (!persona) return null

  const billingStatus = mockBillingByPortalUserId[portalUserId] ?? 'not_started'
  const capabilities = deriveCapabilities({
    billingStatus,
    credentials: persona.credentials,
  })

  return {
    billingStatus,
    capabilities,
    credentials: persona.credentials,
    evaluatedAt,
    participationClass: resolveParticipationClass(persona.credentials),
    schemaVersion: 1,
    subject: { portalUserId },
  }
}

export async function getEntitlementSnapshot(
  portalUserId: string,
  evaluatedAt = new Date().toISOString(),
): Promise<EntitlementSnapshot | null> {
  const [user] = await getDatabase()
    .select({ credentials: users.credentials, id: users.id })
    .from(users)
    .where(eq(users.portalUserId, portalUserId))
    .limit(1)
  if (!user) return null

  const state = await getParticipantDashboardState(user.id, user.credentials)
  return {
    billingStatus: state.billingStatus,
    capabilities: deriveCapabilities({
      billingStatus: state.billingStatus,
      credentials: state.credentials,
    }),
    credentials: state.credentials,
    evaluatedAt,
    participationClass: resolveParticipationClass(state.credentials),
    schemaVersion: 1,
    subject: { portalUserId },
  }
}

export function planEntitlementReconciliation(
  snapshot: EntitlementSnapshot,
  targets: EntitlementTarget[],
): ReconciliationAction[] {
  return targets.map((target) => ({
    operation: 'replace_capabilities',
    portalUserId: snapshot.subject.portalUserId,
    target,
    values: snapshot.capabilities,
  }))
}

export function isEntitlementTarget(value: unknown): value is EntitlementTarget {
  return ENTITLEMENT_TARGETS.includes(value as EntitlementTarget)
}
