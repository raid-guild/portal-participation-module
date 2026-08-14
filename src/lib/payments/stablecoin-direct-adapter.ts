import { getPaymentPlan } from './plans'
import type { PaymentAdapter, PaymentEvent, PaymentSession, PaymentSessionRequest } from './types'

export const GNOSIS_CHAIN_ID = 100
export const RAIDGUILD_TREASURY = '0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC'
export const WXDAI_ADDRESS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const WXDAI_DECIMALS = 18
const PAYMENT_WINDOW_MS = 30 * 60 * 1000

/**
 * Produces direct-to-Safe wxDAI instructions. Chain reconciliation is left to
 * an injected/indexed Gnosis data source in the live implementation.
 */
export class StablecoinDirectAdapter implements PaymentAdapter {
  readonly capabilities = {
    automaticRenewal: false,
    customerPortal: false,
    directToTreasury: true,
    hostedCheckout: false,
  }
  readonly providerName = 'gnosis-wxdai-direct'
  readonly rail = 'stablecoin_direct' as const

  async createPaymentSession(request: PaymentSessionRequest): Promise<PaymentSession> {
    if (!request.expectedWalletAddress || !ADDRESS_PATTERN.test(request.expectedWalletAddress)) {
      throw new Error('A valid payer wallet is required for direct stablecoin payment.')
    }

    const plan = getPaymentPlan(request.planKey)
    const amountAtomic = BigInt(plan.amount.minorUnits) * 10n ** 16n

    return {
      amountAtomic: amountAtomic.toString(),
      chainId: GNOSIS_CHAIN_ID,
      decimals: WXDAI_DECIMALS,
      expectedSender: request.expectedWalletAddress,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString(),
      kind: 'onchain_transfer',
      providerReference: `wxdai_${request.portalUserID}_${request.planKey}_${Date.now()}`,
      rail: this.rail,
      recipient: RAIDGUILD_TREASURY,
      tokenAddress: WXDAI_ADDRESS,
      tokenSymbol: 'WXDAI',
    }
  }

  async createCustomerPortalSession(): Promise<null> {
    return null
  }

  async parseNotification(): Promise<PaymentEvent> {
    throw new Error('Direct stablecoin payments are confirmed through chain reconciliation.')
  }

  async reconcilePayment(): Promise<PaymentEvent | null> {
    // A live implementation queries an indexed Gnosis source or RPC and checks
    // token, recipient, sender, amount, transaction uniqueness, and confirmations.
    return null
  }
}
