import type { PaymentPlan, PaymentPlanKey } from './types'

const memberAmounts = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200] as const

const memberPlans = memberAmounts.map((amount) => ({
  amount: { currency: 'USD' as const, minorUnits: amount * 100 },
  eligibleClass: 'member' as const,
  key: `member_share_${amount}` as PaymentPlanKey,
  sharesEligible: true,
}))

export const paymentPlans: Record<PaymentPlanKey, PaymentPlan> = Object.fromEntries(
  [
    ...memberPlans,
    {
      amount: { currency: 'USD', minorUnits: 2_000 },
      eligibleClass: 'cohort_grad',
      key: 'cohort_grad_20',
      sharesEligible: false,
    },
    {
      amount: { currency: 'USD', minorUnits: 2_000 },
      eligibleClass: 'cohort_participant',
      key: 'cohort_participant_20',
      sharesEligible: false,
    },
  ].map((plan) => [plan.key, plan]),
) as Record<PaymentPlanKey, PaymentPlan>

export function getPaymentPlan(planKey: PaymentPlanKey): PaymentPlan {
  return paymentPlans[planKey]
}

export function isPaymentPlanKey(value: unknown): value is PaymentPlanKey {
  return typeof value === 'string' && Object.hasOwn(paymentPlans, value)
}
