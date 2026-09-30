export const PARTICIPATION_CREDENTIALS = [
  'raidguild_member',
  'cohort_grad',
  'cohort_participant',
] as const

export type ParticipationCredential = (typeof PARTICIPATION_CREDENTIALS)[number]
export type ParticipationClass = 'member' | 'cohort_grad' | 'cohort_participant'
export type BillingStatus = 'active' | 'past_due' | 'canceled' | 'not_started'

export type Capability =
  | 'bounties.access'
  | 'coworking.apprentice'
  | 'coworking.guild'
  | 'coworking.standard'
  | 'learning.library'
  | 'learning.live_programming'
  | 'networking.access'
  | 'raids.full_priority_1'
  | 'raids.full_priority_2_apprentice'
  | 'shares.subscription_eligible'

export type EntitlementContext = {
  billingStatus: BillingStatus
  credentials: ParticipationCredential[]
}

export const STANDARD_SHARE_PRICE_USD = 5
export const MEMBER_SUBSCRIPTION_SHARE_PRICE_USD = 2.5
export const MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT = 50
export const SHARE_PRICE_USD = MEMBER_SUBSCRIPTION_SHARE_PRICE_USD
export const MIN_MEMBER_SUBSCRIPTION_USD = 20
export const MAX_MEMBER_SUBSCRIPTION_USD = 200

export function resolveParticipationClass(
  credentials: ParticipationCredential[],
): ParticipationClass {
  if (credentials.includes('raidguild_member')) return 'member'
  if (credentials.includes('cohort_grad')) return 'cohort_grad'
  return 'cohort_participant'
}

export function hasPaidAccess(status: BillingStatus): boolean {
  return status === 'active'
}

export function deriveCapabilities({
  billingStatus,
  credentials,
}: EntitlementContext): Capability[] {
  const participationClass = resolveParticipationClass(credentials)
  const paid = hasPaidAccess(billingStatus)

  if (participationClass === 'member') {
    return [
      'coworking.standard',
      'coworking.apprentice',
      'coworking.guild',
      'raids.full_priority_1',
      'learning.library',
      'learning.live_programming',
      'networking.access',
      'bounties.access',
      ...(paid ? (['shares.subscription_eligible'] as Capability[]) : []),
    ]
  }

  if (participationClass === 'cohort_grad') {
    return [
      'coworking.standard',
      'coworking.apprentice',
      'learning.library',
      'learning.live_programming',
      'networking.access',
      'bounties.access',
    ]
  }

  return [
    'coworking.standard',
    'learning.library',
    'learning.live_programming',
    'networking.access',
    'bounties.access',
  ]
}

export function calculateMemberShares(monthlyAmountUSD: number): number {
  if (
    monthlyAmountUSD < MIN_MEMBER_SUBSCRIPTION_USD ||
    monthlyAmountUSD > MAX_MEMBER_SUBSCRIPTION_USD
  ) {
    throw new RangeError('Member subscription must be between $20 and $200 per month.')
  }

  return monthlyAmountUSD / MEMBER_SUBSCRIPTION_SHARE_PRICE_USD
}

export const participationClassLabel: Record<ParticipationClass, string> = {
  member: 'RaidGuild member',
  cohort_grad: 'Cohort graduate',
  cohort_participant: 'Cohort participant',
}
