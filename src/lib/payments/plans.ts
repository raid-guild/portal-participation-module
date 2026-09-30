import type { PaymentPlan, PaymentPlanKey } from './types'

const memberAmounts = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200] as const

const memberPlans = memberAmounts.map((amount) => ({
  amount: { currency: 'USD' as const, minorUnits: amount * 100 },
  eligibleClass: 'member' as const,
  key: `member_share_${amount}` as PaymentPlanKey,
  sharesEligible: true,
}))

// Legacy cohort keys remain in PaymentPlanKey for historical payment records.
// Only member contributions can create new payment sessions.
export const paymentPlans: Record<MemberPaymentPlanKey, PaymentPlan> = Object.fromEntries(
  memberPlans.map((plan) => [plan.key, plan]),
) as Record<MemberPaymentPlanKey, PaymentPlan>

export type MemberPaymentPlanKey = Exclude<PaymentPlanKey, 'cohort_grad_20' | 'cohort_participant_20'>

export function getPaymentPlan(planKey: PaymentPlanKey): PaymentPlan {
  if (!isPaymentPlanKey(planKey)) throw new Error('This payment plan is no longer available.')
  return paymentPlans[planKey]
}

export function isPaymentPlanKey(value: unknown): value is MemberPaymentPlanKey {
  return typeof value === 'string' && Object.hasOwn(paymentPlans, value)
}
