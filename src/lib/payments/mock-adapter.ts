import type {
  CustomerPortalRequest,
  CustomerPortalSession,
  PaymentAdapter,
  PaymentEvent,
  PaymentSession,
  PaymentSessionRequest,
  ProviderNotification,
} from './types'

/** Development-only fiat-recurring adapter. It accepts no money. */
export class MockPaymentAdapter implements PaymentAdapter {
  readonly capabilities = {
    automaticRenewal: true,
    customerPortal: true,
    directToTreasury: false,
    hostedCheckout: true,
  }
  readonly providerName = 'mock-fiat'
  readonly rail = 'fiat_recurring' as const

  async createPaymentSession(request: PaymentSessionRequest): Promise<PaymentSession> {
    return {
      kind: 'redirect',
      providerReference: `mock_checkout_${request.portalUserID}_${request.planKey}`,
      rail: this.rail,
      url: `/payments/mock/checkout?plan=${request.planKey}`,
    }
  }

  async createCustomerPortalSession(
    request: CustomerPortalRequest,
  ): Promise<CustomerPortalSession> {
    return {
      providerReference: `mock_portal_${request.customerReference}`,
      url: '/payments/mock/portal',
    }
  }

  async parseNotification(notification: ProviderNotification): Promise<PaymentEvent> {
    const event = JSON.parse(notification.rawBody) as PaymentEvent

    if (event.provider !== this.providerName || !event.eventReference || !event.type) {
      throw new Error('Invalid mock payment event.')
    }

    return event
  }

  async reconcilePayment(): Promise<PaymentEvent | null> {
    return null
  }
}

// Compatibility name while callers migrate to the rail-aware contract.
export { MockPaymentAdapter as MockPaymentProviderAdapter }
