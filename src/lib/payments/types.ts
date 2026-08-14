import type { BillingStatus, ParticipationClass } from '@/lib/domain/participation'

export type PaymentPlanKey =
  | 'member_share_20'
  | 'member_share_40'
  | 'member_share_60'
  | 'member_share_80'
  | 'member_share_100'
  | 'member_share_120'
  | 'member_share_140'
  | 'member_share_160'
  | 'member_share_180'
  | 'member_share_200'
  | 'cohort_grad_20'
  | 'cohort_participant_20'

export type PaymentRail = 'fiat_recurring' | 'stablecoin_direct'

export type Money = {
  currency: 'USD'
  minorUnits: number
}

export type PaymentSessionRequest = {
  cancelURL: string
  customerReference?: string
  email?: string
  expectedWalletAddress?: string
  planKey: PaymentPlanKey
  portalUserID: string
  successURL: string
}

export type RedirectPaymentSession = {
  kind: 'redirect'
  providerReference: string
  rail: 'fiat_recurring'
  url: string
}

export type OnchainPaymentSession = {
  amountAtomic: string
  chainId: number
  decimals: number
  expectedSender: string
  expiresAt: string
  kind: 'onchain_transfer'
  providerReference: string
  rail: 'stablecoin_direct'
  recipient: string
  tokenAddress: string
  tokenSymbol: 'WXDAI'
}

export type PaymentSession = RedirectPaymentSession | OnchainPaymentSession

export type CustomerPortalRequest = {
  customerReference: string
  returnURL: string
}

export type CustomerPortalSession = {
  providerReference: string
  url: string
}

export type NormalizedSubscription = {
  cancelAtPeriodEnd: boolean
  currentPeriodEndsAt?: string
  currentPeriodStartsAt?: string
  customerReference?: string
  planKey: PaymentPlanKey
  provider: string
  rail: PaymentRail
  status: BillingStatus
  subscriptionReference: string
}

export type ConfirmedPayment = {
  amount: Money
  confirmedAt: string
  customerReference?: string
  onchainTransactionHash?: string
  payerWalletAddress?: string
  planKey: PaymentPlanKey
  provider: string
  providerPaymentReference: string
  rail: PaymentRail
}

export type PaymentEvent = {
  createdAt: string
  eventReference: string
  payment?: ConfirmedPayment
  provider: string
  subscription?: NormalizedSubscription
  type:
    | 'checkout.completed'
    | 'invoice.failed'
    | 'invoice.paid'
    | 'payment.confirmed'
    | 'payment.expired'
    | 'payment.refunded'
    | 'subscription.created'
    | 'subscription.deleted'
    | 'subscription.updated'
}

export type ProviderNotification = {
  headers: Headers
  rawBody: string
}

export type PaymentAdapterCapabilities = {
  automaticRenewal: boolean
  customerPortal: boolean
  directToTreasury: boolean
  hostedCheckout: boolean
}

export interface PaymentAdapter {
  readonly capabilities: PaymentAdapterCapabilities
  readonly providerName: string
  readonly rail: PaymentRail
  createPaymentSession(request: PaymentSessionRequest): Promise<PaymentSession>
  createCustomerPortalSession(
    request: CustomerPortalRequest,
  ): Promise<CustomerPortalSession | null>
  parseNotification(notification: ProviderNotification): Promise<PaymentEvent>
  reconcilePayment(providerReference: string): Promise<PaymentEvent | null>
}

export type PaymentPlan = {
  amount: Money
  eligibleClass: ParticipationClass
  key: PaymentPlanKey
  sharesEligible: boolean
}
